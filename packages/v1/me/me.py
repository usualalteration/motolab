"""Me / session validation: derives identity from the opaque Redis session
token supplied in the Authorization header. Never trusts a browser user id.
"""
import re


def request_headers(args):
    headers = args.get("__ow_headers") or args.get("headers") or {}
    if not isinstance(headers, dict):
        return {}
    return {str(k).lower(): v for k, v in headers.items()}


def session_key(ctx, token):
    prefix = getattr(ctx, "REDIS_PREFIX", "") or ""
    return f"{prefix}session:{token}"


def extract_token(args):
    auth = request_headers(args).get("authorization", "")
    if not auth:
        return ""
    m = re.match(r"Bearer\s+(.+)", auth.strip(), re.IGNORECASE)
    return m.group(1).strip() if m else ""


def user_dict(row):
    return {
        "id": row[0],
        "email": row[1],
        "name": row[2],
        "createdAt": row[3].isoformat() if row[3] else None,
    }


def main(args, ctx=None):
    if not ctx or not hasattr(ctx, "POSTGRESQL") or not hasattr(ctx, "REDIS"):
        return {"success": False, "error": "Service not configured", "data": None}
    token = extract_token(args)
    if not token:
        return {"success": False, "error": "Token not provided", "data": None}

    raw = ctx.REDIS.get(session_key(ctx, token))
    if not raw:
        return {"success": False, "error": "Invalid or expired session", "data": None}
    try:
        user_id = int(raw)
    except (TypeError, ValueError):
        return {"success": False, "error": "Invalid session", "data": None}

    conn = ctx.POSTGRESQL
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email, name, created_at FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
        if row is None:
            ctx.REDIS.delete(session_key(ctx, token))
            return {"success": False, "error": "User not found", "data": None}
        # Refresh TTL on activity.
        ctx.REDIS.expire(session_key(ctx, token), 7 * 24 * 3600)
        return {"success": True, "data": {"user": user_dict(row)}, "error": None}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
