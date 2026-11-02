"""Documents: S3-backed file storage with PostgreSQL metadata.

Flow:
  POST action=upload-url   -> returns a presigned S3 PUT URL + s3_key
  POST action=confirm       -> records document metadata after a successful upload
  GET  ?motorcycleId=       -> lists documents for a motorcycle
  GET  /{id}                -> returns a presigned GET URL for download
  DELETE /{id}              -> deletes document + S3 object
"""
import json
import re
import uuid

SESSION_TTL = 7 * 24 * 3600
PRESIGN_EXPIRY = 600  # 10 minutes


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
               "S3_HOST", "S3_PORT", "S3_ACCESS_KEY", "S3_SECRET_KEY",
               "S3_BUCKET_DATA", "S3_BUCKET_STATIC", "S3_PUBLIC",
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
    if not moto_id:
        return False
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM motorcycles WHERE id = %s AND owner_id = %s", (moto_id, user_id))
        return cur.fetchone() is not None


def doc_dict(row):
    return {
        "id": row[0], "ownerId": row[1], "motorcycleId": row[2], "maintenanceId": row[3],
        "filename": row[4], "contentType": row[5], "sizeBytes": row[6], "s3Key": row[7],
        "docType": row[8], "createdAt": row[9].isoformat() if row[9] else None,
    }


DOC_COLS = ("id, owner_id, motorcycle_id, maintenance_id, filename, content_type, "
            "size_bytes, s3_key, doc_type, created_at")


def main(args, ctx=None):
    if not ctx or not hasattr(ctx, "POSTGRESQL") or not hasattr(ctx, "REDIS") or not hasattr(ctx, "S3_CLIENT"):
        return {"success": False, "error": "Service not configured", "data": None}
    user_id, err = require_user(args, ctx)
    if err:
        return err
    method = request_method(args)
    data = request_data(args)
    did = to_int(route_id(args))
    bucket = getattr(ctx, "S3_DATA", None)
    s3 = ctx.S3_CLIENT
    conn = ctx.POSTGRESQL
    try:
        if method == "POST":
            action = (data.get("action") or "").strip()
            if action == "upload-url":
                moto_id = to_int(data.get("motorcycleId"))
                if not owns_motorcycle(conn, user_id, moto_id):
                    return {"success": False, "error": "Motorcycle not found", "data": None}
                filename = (data.get("filename") or "").strip()
                if not filename:
                    return {"success": False, "error": "filename is required", "data": None}
                content_type = (data.get("contentType") or "application/octet-stream").strip()
                s3_key = f"docs/{user_id}/{moto_id}/{uuid.uuid4().hex}_{filename}"
                url = s3.generate_presigned_url(
                    ClientMethod="put_object",
                    Params={"Bucket": bucket, "Key": s3_key, "ContentType": content_type},
                    ExpiresIn=PRESIGN_EXPIRY,
                    HttpMethod="PUT",
                )
                return {"success": True, "data": {"uploadUrl": url, "s3Key": s3_key,
                                                  "contentType": content_type}, "error": None}

            if action == "confirm":
                s3_key = (data.get("s3Key") or "").strip()
                if not s3_key or not s3_key.startswith(f"docs/{user_id}/"):
                    return {"success": False, "error": "Invalid s3Key", "data": None}
                moto_id = to_int(data.get("motorcycleId"))
                if not owns_motorcycle(conn, user_id, moto_id):
                    return {"success": False, "error": "Motorcycle not found", "data": None}
                filename = (data.get("filename") or "").strip()
                if not filename:
                    return {"success": False, "error": "filename is required", "data": None}
                # Verify the object actually exists in S3.
                try:
                    head = s3.head_object(Bucket=bucket, Key=s3_key)
                    size_bytes = head.get("ContentLength")
                    content_type = head.get("ContentType") or data.get("contentType")
                except Exception:
                    return {"success": False, "error": "Object not found in storage; upload may have failed", "data": None}
                values = (
                    user_id, moto_id, to_int(data.get("maintenanceId")), filename,
                    content_type, size_bytes, s3_key, (data.get("docType") or "document").strip(),
                )
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO documents (owner_id, motorcycle_id, maintenance_id, filename, "
                        "content_type, size_bytes, s3_key, doc_type) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING " + DOC_COLS, values)
                    row = cur.fetchone()
                conn.commit()
                return {"success": True, "data": doc_dict(row), "error": None}

            return {"success": False, "error": "Unknown action; use upload-url or confirm", "data": None}

        if method == "GET":
            if did:
                with conn.cursor() as cur:
                    cur.execute(f"SELECT {DOC_COLS} FROM documents WHERE id = %s AND owner_id = %s", (did, user_id))
                    row = cur.fetchone()
                if not row:
                    return {"success": False, "error": "Document not found", "data": None}
                d = doc_dict(row)
                url = s3.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={"Bucket": bucket, "Key": d["s3Key"]},
                    ExpiresIn=PRESIGN_EXPIRY,
                )
                return {"success": True, "data": {"downloadUrl": url, "document": d}, "error": None}
            moto_id = to_int(data.get("motorcycleId"))
            if not owns_motorcycle(conn, user_id, moto_id):
                return {"success": False, "error": "Motorcycle not found", "data": None}
            with conn.cursor() as cur:
                cur.execute(f"SELECT {DOC_COLS} FROM documents WHERE motorcycle_id = %s AND owner_id = %s ORDER BY created_at DESC", (moto_id, user_id))
                rows = [doc_dict(r) for r in cur.fetchall()]
            return {"success": True, "data": rows, "error": None}

        if method == "DELETE":
            if not did:
                return {"success": False, "error": "Document id required", "data": None}
            with conn.cursor() as cur:
                cur.execute("SELECT s3_key FROM documents WHERE id = %s AND owner_id = %s", (did, user_id))
                row = cur.fetchone()
                if not row:
                    return {"success": False, "error": "Document not found", "data": None}
                s3_key = row[0]
                cur.execute("DELETE FROM documents WHERE id = %s AND owner_id = %s", (did, user_id))
            conn.commit()
            try:
                s3.delete_object(Bucket=bucket, Key=s3_key)
            except Exception:
                pass
            return {"success": True, "data": {"deleted": True}, "error": None}

        return {"success": False, "error": f"Method {method} not allowed", "data": None}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
