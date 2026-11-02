"""Motorcycles CRUD. Single endpoint branches on HTTP method and path id.
Every operation derives the owner from the validated Redis session token and
verifies ownership before mutating or returning a motorcycle.
"""
import json
import re

SESSION_TTL = 7 * 24 * 3600


# ---------- shared request helpers ----------

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
    """Return (user_id, None) on success or (None, error_response)."""
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


# ---------- mapping ----------

def moto_dict(row):
    return {
        "id": row[0], "ownerId": row[1], "brand": row[2], "model": row[3],
        "year": row[4], "engineDisplacement": row[5],
        "registrationDate": row[6].isoformat() if row[6] else None,
        "currentMileage": row[7], "vin": row[8], "notes": row[9],
        "photoUrl": row[10],
        "createdAt": row[11].isoformat() if row[11] else None,
        "updatedAt": row[12].isoformat() if row[12] else None,
    }


MOTO_COLS = (
    "id, owner_id, brand, model, year, engine_displacement, registration_date, "
    "current_mileage, vin, notes, photo_url, created_at, updated_at"
)

INT_FIELDS = {"year", "engineDisplacement", "currentMileage"}


def to_int(v):
    if v in (None, ""):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# ---------- handlers ----------

def list_motorcycles(conn, user_id):
    with conn.cursor() as cur:
        cur.execute(f"SELECT {MOTO_COLS} FROM motorcycles WHERE owner_id = %s ORDER BY created_at DESC", (user_id,))
        return [moto_dict(r) for r in cur.fetchall()]


def get_motorcycle(conn, user_id, mid):
    with conn.cursor() as cur:
        cur.execute(f"SELECT {MOTO_COLS} FROM motorcycles WHERE id = %s AND owner_id = %s", (mid, user_id))
        row = cur.fetchone()
    return moto_dict(row) if row else None


def create_motorcycle(conn, user_id, data):
    brand = (data.get("brand") or "").strip()
    model = (data.get("model") or "").strip()
    if not brand or not model:
        return None, "Brand and model are required"
    values = (
        user_id, brand, model, to_int(data.get("year")),
        to_int(data.get("engineDisplacement")), data.get("registrationDate"),
        to_int(data.get("currentMileage")) or 0, (data.get("vin") or "").strip() or None,
        (data.get("notes") or "").strip() or None, data.get("photoUrl"),
    )
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO motorcycles (owner_id, brand, model, year, engine_displacement, "
            "registration_date, current_mileage, vin, notes, photo_url) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING " + MOTO_COLS,
            values,
        )
        row = cur.fetchone()
    conn.commit()
    return moto_dict(row), None


def update_motorcycle(conn, user_id, mid, data):
    fields = []
    values = []
    mapping = [
        ("brand", "brand"), ("model", "model"), ("year", "year"),
        ("engineDisplacement", "engine_displacement"),
        ("registrationDate", "registration_date"),
        ("currentMileage", "current_mileage"), ("vin", "vin"),
        ("notes", "notes"), ("photoUrl", "photo_url"),
    ]
    for json_key, col in mapping:
        if json_key in data:
            val = data[json_key]
            if json_key in ("year", "engineDisplacement", "currentMileage"):
                val = to_int(val)
            elif json_key in ("brand", "model", "vin", "notes"):
                val = (val or "").strip() or None
            fields.append(f"{col} = %s")
            values.append(val)
    if not fields:
        return get_motorcycle(conn, user_id, mid), None
    fields.append("updated_at = now()")
    values.extend([mid, user_id])
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE motorcycles SET " + ", ".join(fields) +
            " WHERE id = %s AND owner_id = %s RETURNING " + MOTO_COLS,
            values,
        )
        row = cur.fetchone()
    conn.commit()
    return (moto_dict(row) if row else None), (None if row else "Motorcycle not found")


def delete_motorcycle(conn, user_id, mid):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM motorcycles WHERE id = %s AND owner_id = %s", (mid, user_id))
        deleted = cur.rowcount
    conn.commit()
    return deleted > 0


# ---------- entry ----------

def main(args, ctx=None):
    if not ctx or not hasattr(ctx, "POSTGRESQL") or not hasattr(ctx, "REDIS"):
        return {"success": False, "error": "Service not configured", "data": None}
    user_id, err = require_user(args, ctx)
    if err:
        return err
    method = request_method(args)
    data = request_data(args)
    mid = to_int(route_id(args)) or to_int(data.get("id"))
    conn = ctx.POSTGRESQL
    try:
        if method == "GET":
            if mid:
                m = get_motorcycle(conn, user_id, mid)
                if not m:
                    return {"success": False, "error": "Motorcycle not found", "data": None}
                return {"success": True, "data": m, "error": None}
            return {"success": True, "data": list_motorcycles(conn, user_id), "error": None}
        if method == "POST":
            m, e = create_motorcycle(conn, user_id, data)
            if e:
                return {"success": False, "error": e, "data": None}
            return {"success": True, "data": m, "error": None}
        if method in ("PUT", "PATCH"):
            if not mid:
                return {"success": False, "error": "Motorcycle id required", "data": None}
            m, e = update_motorcycle(conn, user_id, mid, data)
            if e:
                return {"success": False, "error": e, "data": None}
            return {"success": True, "data": m, "error": None}
        if method == "DELETE":
            if not mid:
                return {"success": False, "error": "Motorcycle id required", "data": None}
            ok = delete_motorcycle(conn, user_id, mid)
            if not ok:
                return {"success": False, "error": "Motorcycle not found", "data": None}
            return {"success": True, "data": {"deleted": True}, "error": None}
        return {"success": False, "error": f"Method {method} not allowed", "data": None}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
