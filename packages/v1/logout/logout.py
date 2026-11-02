"""Logout: deletes the opaque Redis session record, invalidating the token.
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


def main(args, ctx=None):
    if not ctx or not hasattr(ctx, "REDIS"):
        return {"success": False, "error": "Service not configured", "data": None}
    token = extract_token(args)
    if not token:
        return {"success": False, "error": "Token not provided", "data": None}
    try:
        ctx.REDIS.delete(session_key(ctx, token))
        return {"success": True, "data": {"loggedOut": True}, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e), "data": None}
