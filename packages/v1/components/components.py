"""Components CRUD. Components belong to a motorcycle owned by the requesting
user; ownership is verified before every operation.
"""
import json
import re

SESSION_TTL = 7 * 24 * 3600


def request_headers(args):
    headers = args.get("__ow_headers") or args.get("headers") or {}
    if not isinstance(headers, dict):
        return {}
    return {str(k).lower(): v for k, v in headers.items()}


def request_method(args):
    return (args.get("__ow_method") or args.get("method") or "GET").upper()


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


def route_id(args):
    raw = str(args.get("__ow_path") or args.get("path") or "").strip("/")
    if not raw:
        return ""
    parts = [p for p in raw.split("/") if p]
    return parts[-1] if parts else ""


def to_int(v):
    if v in (None, ""):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def owns_motorcycle(conn, user_id, moto_id):
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM motorcycles WHERE id = %s AND owner_id = %s", (moto_id, user_id))
        return cur.fetchone() is not None


def comp_dict(row):
    return {
        "id": row[0], "motorcycleId": row[1], "ownerId": row[2], "name": row[3],
        "category": row[4], "installationDate": row[5].isoformat() if row[5] else None,
        "installationMileage": row[6], "replacementDate": row[7].isoformat() if row[7] else None,
        "replacementMileage": row[8], "expectedMaintenanceInterval": row[9],
        "notes": row[10],
        "createdAt": row[11].isoformat() if row[11] else None,
        "updatedAt": row[12].isoformat() if row[12] else None,
    }


COMP_COLS = ("id, motorcycle_id, owner_id, name, category, installation_date, "
             "installation_mileage, replacement_date, replacement_mileage, "
             "expected_maintenance_interval, notes, created_at, updated_at")


def main(args, ctx=None):
    if not ctx or not hasattr(ctx, "POSTGRESQL") or not hasattr(ctx, "REDIS"):
        return {"success": False, "error": "Service not configured", "data": None}
    user_id, err = require_user(args, ctx)
    if err:
        return err
    method = request_method(args)
    data = request_data(args)
    cid = to_int(route_id(args)) or to_int(data.get("id"))
    moto_id = to_int(data.get("motorcycleId"))
    conn = ctx.POSTGRESQL
    try:
        if method == "GET":
            if not moto_id:
                return {"success": False, "error": "motorcycleId is required", "data": None}
            if not owns_motorcycle(conn, user_id, moto_id):
                return {"success": False, "error": "Motorcycle not found", "data": None}
            with conn.cursor() as cur:
                cur.execute(f"SELECT {COMP_COLS} FROM components WHERE motorcycle_id = %s ORDER BY created_at DESC", (moto_id,))
                rows = [comp_dict(r) for r in cur.fetchall()]
            return {"success": True, "data": rows, "error": None}

        if method == "POST":
            if not moto_id:
                return {"success": False, "error": "motorcycleId is required", "data": None}
            if not owns_motorcycle(conn, user_id, moto_id):
                return {"success": False, "error": "Motorcycle not found", "data": None}
            name = (data.get("name") or "").strip()
            if not name:
                return {"success": False, "error": "name is required", "data": None}
            values = (
                moto_id, user_id, name, (data.get("category") or "").strip() or None,
                data.get("installationDate"), to_int(data.get("installationMileage")),
                data.get("replacementDate"), to_int(data.get("replacementMileage")),
                to_int(data.get("expectedMaintenanceInterval")),
                (data.get("notes") or "").strip() or None,
            )
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO components (motorcycle_id, owner_id, name, category, "
                    "installation_date, installation_mileage, replacement_date, "
                    "replacement_mileage, expected_maintenance_interval, notes) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING " + COMP_COLS, values)
                row = cur.fetchone()
            conn.commit()
            return {"success": True, "data": comp_dict(row), "error": None}

        if method in ("PUT", "PATCH"):
            if not cid:
                return {"success": False, "error": "Component id required", "data": None}
            with conn.cursor() as cur:
                cur.execute(f"SELECT {COMP_COLS} FROM components WHERE id = %s AND owner_id = %s", (cid, user_id))
                row = cur.fetchone()
            if not row:
                return {"success": False, "error": "Component not found", "data": None}
            existing = comp_dict(row)
            fields = []
            values = []
            mapping = [
                ("name", "name", "text"), ("category", "category", "text"),
                ("installationDate", "installation_date", "date"),
                ("installationMileage", "installation_mileage", "int"),
                ("replacementDate", "replacement_date", "date"),
                ("replacementMileage", "replacement_mileage", "int"),
                ("expectedMaintenanceInterval", "expected_maintenance_interval", "int"),
                ("notes", "notes", "text"),
            ]
            for jk, col, typ in mapping:
                if jk in data:
                    val = data[jk]
                    if typ == "int":
                        val = to_int(val)
                    elif typ == "text":
                        val = (val or "").strip() or None
                    fields.append(f"{col} = %s")
                    values.append(val)
            if not fields:
                return {"success": True, "data": existing, "error": None}
            fields.append("updated_at = now()")
            values.extend([cid, user_id])
            with conn.cursor() as cur:
                cur.execute("UPDATE components SET " + ", ".join(fields) +
                            " WHERE id = %s AND owner_id = %s RETURNING " + COMP_COLS, values)
                row = cur.fetchone()
            conn.commit()
            return {"success": True, "data": comp_dict(row), "error": None}

        if method == "DELETE":
            if not cid:
                return {"success": False, "error": "Component id required", "data": None}
            with conn.cursor() as cur:
                cur.execute("DELETE FROM components WHERE id = %s AND owner_id = %s", (cid, user_id))
                deleted = cur.rowcount
            conn.commit()
            if not deleted:
                return {"success": False, "error": "Component not found", "data": None}
            return {"success": True, "data": {"deleted": True}, "error": None}

        return {"success": False, "error": f"Method {method} not allowed", "data": None}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
