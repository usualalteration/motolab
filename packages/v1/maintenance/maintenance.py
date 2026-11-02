"""Maintenance records CRUD + history. Records belong to a motorcycle owned by
the requesting user; ownership is verified before every operation.
"""
import json
import re

SESSION_TTL = 7 * 24 * 3600
VALID_CATEGORIES = {
    "engine_oil", "oil_filter", "air_filter", "spark_plugs", "brakes",
    "brake_fluid", "chain", "sprockets", "tires", "battery", "coolant",
    "general_inspection", "other",
}


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


def to_float(v):
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def owns_motorcycle(conn, user_id, moto_id):
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM motorcycles WHERE id = %s AND owner_id = %s", (moto_id, user_id))
        return cur.fetchone() is not None


def rec_dict(row):
    return {
        "id": row[0], "motorcycleId": row[1], "ownerId": row[2], "category": row[3],
        "operationDate": row[4].isoformat() if row[4] else None,
        "mileage": row[5], "cost": float(row[6]) if row[6] is not None else None,
        "notes": row[7], "componentId": row[8],
        "createdAt": row[9].isoformat() if row[9] else None,
        "updatedAt": row[10].isoformat() if row[10] else None,
    }


REC_COLS = ("id, motorcycle_id, owner_id, category, operation_date, mileage, cost, "
            "notes, component_id, created_at, updated_at")


def main(args, ctx=None):
    if not ctx or not hasattr(ctx, "POSTGRESQL") or not hasattr(ctx, "REDIS"):
        return {"success": False, "error": "Service not configured", "data": None}
    user_id, err = require_user(args, ctx)
    if err:
        return err
    method = request_method(args)
    data = request_data(args)
    mid = to_int(route_id(args)) or to_int(data.get("id"))
    moto_id = to_int(data.get("motorcycleId"))
    conn = ctx.POSTGRESQL
    try:
        if method == "GET":
            if not moto_id:
                return {"success": False, "error": "motorcycleId is required", "data": None}
            if not owns_motorcycle(conn, user_id, moto_id):
                return {"success": False, "error": "Motorcycle not found", "data": None}
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {REC_COLS} FROM maintenance_records "
                    "WHERE motorcycle_id = %s ORDER BY operation_date DESC, created_at DESC",
                    (moto_id,),
                )
                rows = [rec_dict(r) for r in cur.fetchall()]
            return {"success": True, "data": rows, "error": None}

        if method == "POST":
            if not moto_id:
                return {"success": False, "error": "motorcycleId is required", "data": None}
            if not owns_motorcycle(conn, user_id, moto_id):
                return {"success": False, "error": "Motorcycle not found", "data": None}
            category = (data.get("category") or "").strip()
            if category not in VALID_CATEGORIES:
                return {"success": False, "error": "Invalid category", "data": None}
            op_date = data.get("operationDate")
            if not op_date:
                return {"success": False, "error": "operationDate is required", "data": None}
            comp_id = to_int(data.get("componentId"))
            if comp_id is not None:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1 FROM components WHERE id = %s AND motorcycle_id = %s AND owner_id = %s",
                                (comp_id, moto_id, user_id))
                    if cur.fetchone() is None:
                        return {"success": False, "error": "Component not found for this motorcycle", "data": None}
            values = (
                moto_id, user_id, category, op_date, to_int(data.get("mileage")),
                to_float(data.get("cost")), (data.get("notes") or "").strip() or None, comp_id,
            )
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO maintenance_records (motorcycle_id, owner_id, category, "
                    "operation_date, mileage, cost, notes, component_id) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING " + REC_COLS, values)
                row = cur.fetchone()
            conn.commit()
            return {"success": True, "data": rec_dict(row), "error": None}

        if method in ("PUT", "PATCH"):
            if not mid:
                return {"success": False, "error": "Maintenance id required", "data": None}
            with conn.cursor() as cur:
                cur.execute(f"SELECT {REC_COLS} FROM maintenance_records WHERE id = %s AND owner_id = %s", (mid, user_id))
                row = cur.fetchone()
            if not row:
                return {"success": False, "error": "Record not found", "data": None}
            existing = rec_dict(row)
            category = data.get("category", existing["category"])
            if category not in VALID_CATEGORIES:
                return {"success": False, "error": "Invalid category", "data": None}
            op_date = data.get("operationDate", existing["operationDate"])
            mileage = to_int(data.get("mileage")) if "mileage" in data else existing["mileage"]
            cost = to_float(data.get("cost")) if "cost" in data else existing["cost"]
            notes = data.get("notes", existing["notes"])
            comp_id = to_int(data.get("componentId")) if "componentId" in data else existing["componentId"]
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE maintenance_records SET category=%s, operation_date=%s, mileage=%s, "
                    "cost=%s, notes=%s, component_id=%s, updated_at=now() "
                    "WHERE id=%s AND owner_id=%s RETURNING " + REC_COLS,
                    (category, op_date, mileage, cost, notes, comp_id, mid, user_id))
                row = cur.fetchone()
            conn.commit()
            return {"success": True, "data": rec_dict(row), "error": None}

        if method == "DELETE":
            if not mid:
                return {"success": False, "error": "Maintenance id required", "data": None}
            with conn.cursor() as cur:
                cur.execute("DELETE FROM maintenance_records WHERE id = %s AND owner_id = %s", (mid, user_id))
                deleted = cur.rowcount
            conn.commit()
            if not deleted:
                return {"success": False, "error": "Record not found", "data": None}
            return {"success": True, "data": {"deleted": True}, "error": None}

        return {"success": False, "error": f"Method {method} not allowed", "data": None}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
