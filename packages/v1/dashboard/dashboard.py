"""Dashboard: aggregates real data for the authenticated user's selected
motorcycle (or all motorcycles). Returns summary stats, recent maintenance,
upcoming maintenance derived from schedules, and component status overview.
"""
import json
import re
from datetime import date, timedelta

SESSION_TTL = 7 * 24 * 3600


def request_headers(args):
    headers = args.get("__ow_headers") or args.get("headers") or {}
    if not isinstance(headers, dict):
        return {}
    return {str(k).lower(): v for k, v in headers.items()}


def request_data(args):
    data = dict(args) if isinstance(args, dict) else {}
    body = data.get("body")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            body = {}
    merged = dict(body) if isinstance(body, dict) else {}
    ignored = {"body", "POSTGRES_URL", "REDIS_URL", "REDIS_PREFIX",
               "__ow_method", "__ow_headers", "__ow_path"}
    merged.update({k: v for k, v in data.items() if k not in ignored})
    return merged


def session_key(ctx, token):
    prefix = getattr(ctx, "REDIS_PREFIX", "") or ""
    return f"{prefix}session:{token}"


def extract_token(args):
    auth = request_headers(args).get("authorization", "")
    if not auth:
        return ""
    m = re.match(r"Bearer\s+(.+)", auth.strip(), re.IGNORECASE)
    return m.group(1).strip() if m else ""


def require_user(args, ctx):
    token = extract_token(args)
    if not token:
        return None, {"success": False, "error": "Token not provided", "data": None}
    raw = ctx.REDIS.get(session_key(ctx, token))
    if not raw:
        return None, {"success": False, "error": "Invalid or expired session", "data": None}
    try:
        uid = int(raw)
    except (TypeError, ValueError):
        return None, {"success": False, "error": "Invalid session", "data": None}
    ctx.REDIS.expire(session_key(ctx, token), SESSION_TTL)
    return uid, None


def to_int(v):
    if v in (None, ""):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def moto_brief(row):
    return {
        "id": row[0], "brand": row[1], "model": row[2], "year": row[3],
        "currentMileage": row[4], "photoUrl": row[5],
    }


def main(args, ctx=None):
    if not ctx or not hasattr(ctx, "POSTGRESQL") or not hasattr(ctx, "REDIS"):
        return {"success": False, "error": "Service not configured", "data": None}
    user_id, err = require_user(args, ctx)
    if err:
        return err
    data = request_data(args)
    moto_id = to_int(data.get("motorcycleId"))
    conn = ctx.POSTGRESQL
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, brand, model, year, current_mileage, photo_url "
                "FROM motorcycles WHERE owner_id = %s ORDER BY created_at DESC", (user_id,))
            motorcycles = [moto_brief(r) for r in cur.fetchall()]

        if not motorcycles:
            return {"success": True, "data": {
                "motorcycles": [], "selected": None, "stats": {
                    "totalMotorcycles": 0, "totalMaintenance": 0, "totalComponents": 0,
                    "totalDocuments": 0, "upcomingCount": 0,
                },
                "recentMaintenance": [], "upcomingMaintenance": [], "componentStatus": [],
            }, "error": None}

        if moto_id is None or not any(m["id"] == moto_id for m in motorcycles):
            moto_id = motorcycles[0]["id"]

        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, brand, model, year, engine_displacement, registration_date, "
                "current_mileage, vin, notes, photo_url, created_at "
                "FROM motorcycles WHERE id = %s AND owner_id = %s", (moto_id, user_id))
            row = cur.fetchone()
            selected = None
            if row:
                selected = {
                    "id": row[0], "brand": row[1], "model": row[2], "year": row[3],
                    "engineDisplacement": row[4],
                    "registrationDate": row[5].isoformat() if row[5] else None,
                    "currentMileage": row[6], "vin": row[7], "notes": row[8],
                    "photoUrl": row[9], "createdAt": row[10].isoformat() if row[10] else None,
                }

            # Recent maintenance (last 5).
            cur.execute(
                "SELECT id, category, operation_date, mileage, cost, notes "
                "FROM maintenance_records WHERE motorcycle_id = %s AND owner_id = %s "
                "ORDER BY operation_date DESC, created_at DESC LIMIT 5", (moto_id, user_id))
            recent = [{
                "id": r[0], "category": r[1],
                "operationDate": r[2].isoformat() if r[2] else None,
                "mileage": r[3], "cost": float(r[4]) if r[4] is not None else None,
                "notes": r[5],
            } for r in cur.fetchall()]

            # Upcoming maintenance derived from schedules.
            today = date.today()
            upcoming = []
            cur.execute(
                "SELECT id, category, interval_mileage, interval_days, "
                "last_performed_mileage, last_performed_date, verified "
                "FROM maintenance_schedules WHERE motorcycle_id = %s AND owner_id = %s",
                (moto_id, user_id))
            for r in cur.fetchall():
                sid, category, int_mileage, int_days, last_mileage, last_date, verified = r
                due_mileage = None
                due_date = None
                if int_mileage and last_mileage is not None:
                    due_mileage = last_mileage + int_mileage
                elif int_mileage and selected:
                    due_mileage = (selected["currentMileage"] or 0) + int_mileage
                if int_days and last_date:
                    due_date = last_date + timedelta(days=int_days)
                elif int_days:
                    due_date = today + timedelta(days=int_days)
                upcoming.append({
                    "scheduleId": sid, "category": category, "verified": verified,
                    "intervalMileage": int_mileage, "intervalDays": int_days,
                    "dueMileage": due_mileage, "dueDate": due_date.isoformat() if due_date else None,
                })
            upcoming.sort(key=lambda u: (u["dueDate"] or "9999", u["dueMileage"] or 10**9))

            # Component status overview.
            cur.execute(
                "SELECT id, name, category, installation_mileage, replacement_mileage, "
                "expected_maintenance_interval "
                "FROM components WHERE motorcycle_id = %s AND owner_id = %s "
                "AND replacement_date IS NULL ORDER BY created_at DESC", (moto_id, user_id))
            components = []
            for r in cur.fetchall():
                cid, name, cat, inst_mileage, repl_mileage, expected = r
                status = "active"
                if expected and inst_mileage is not None and selected:
                    current = selected["currentMileage"] or 0
                    if current - inst_mileage >= expected:
                        status = "due"
                    elif current - inst_mileage >= expected * 0.9:
                        status = "soon"
                components.append({
                    "id": cid, "name": name, "category": cat,
                    "installationMileage": inst_mileage, "replacementMileage": repl_mileage,
                    "expectedMaintenanceInterval": expected, "status": status,
                })

            # Stats.
            cur.execute("SELECT COUNT(*) FROM maintenance_records WHERE owner_id = %s", (user_id,))
            total_maint = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM components WHERE owner_id = %s", (user_id,))
            total_comp = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM documents WHERE owner_id = %s", (user_id,))
            total_docs = cur.fetchone()[0]

        return {"success": True, "data": {
            "motorcycles": motorcycles,
            "selected": selected,
            "stats": {
                "totalMotorcycles": len(motorcycles),
                "totalMaintenance": total_maint,
                "totalComponents": total_comp,
                "totalDocuments": total_docs,
                "upcomingCount": len(upcoming),
            },
            "recentMaintenance": recent,
            "upcomingMaintenance": upcoming,
            "componentStatus": components,
        }, "error": None}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
