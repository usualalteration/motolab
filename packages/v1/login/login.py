"""Login: verifies bcrypt password and issues an opaque Redis session token.
"""
import bcrypt
import secrets

SESSION_TTL = 7 * 24 * 3600  # 7 days


def request_data(args):
    data = dict(args) if isinstance(args, dict) else {}
    body = data.get("body")
    if isinstance(body, str):
        try:
            import json
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
    data = request_data(args)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return {"success": False, "error": "Email and password are required", "data": None}

    conn = ctx.POSTGRESQL
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, password_hash, name, created_at FROM users WHERE email = %s",
                (email,),
            )
            row = cur.fetchone()
        if row is None:
            return {"success": False, "error": "Invalid credentials", "data": None}
        user_id, user_email, pw_hash, user_name, created = row
        if not bcrypt.checkpw(password.encode("utf-8"), pw_hash.encode("utf-8")):
            return {"success": False, "error": "Invalid credentials", "data": None}

        token = secrets.token_urlsafe(32)
        ctx.REDIS.setex(session_key(ctx, token), SESSION_TTL, str(user_id))

        return {
            "success": True,
            "data": {"token": token, "user": {"id": user_id, "email": user_email,
                                              "name": user_name,
                                              "createdAt": created.isoformat() if created else None}},
            "error": None,
        }
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
