"""Registration: creates a user (bcrypt-hashed password) and an authenticated
opaque session stored in Redis. Returns the session token + user profile.
"""
import bcrypt
import secrets
import re

SESSION_TTL = 7 * 24 * 3600  # 7 days
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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
    name = (data.get("name") or "").strip() or None

    if not email or not EMAIL_RE.match(email):
        return {"success": False, "error": "Valid email is required", "data": None}
    if len(password) < 8:
        return {"success": False, "error": "Password must be at least 8 characters", "data": None}

    conn = ctx.POSTGRESQL
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone() is not None:
                return {"success": False, "error": "Email already registered", "data": None}
            pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            cur.execute(
                "INSERT INTO users (email, password_hash, name) VALUES (%s, %s, %s) "
                "RETURNING id, email, name, created_at",
                (email, pw_hash, name),
            )
            row = cur.fetchone()
        conn.commit()

        token = secrets.token_urlsafe(32)
        ctx.REDIS.setex(session_key(ctx, token), SESSION_TTL, str(row[0]))

        return {"success": True, "data": {"token": token, "user": user_dict(row)}, "error": None}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
