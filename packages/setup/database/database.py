"""Idempotent schema initialization for MotoLab.

Creates all tables if missing and is non-destructive on re-runs.
"""


SCHEMA_SQL = """
-- Users: registered motorcycle owners. Passwords stored as bcrypt hashes.
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Motorcycles: each belongs to exactly one owner.
CREATE TABLE IF NOT EXISTS motorcycles (
    id                 BIGSERIAL PRIMARY KEY,
    owner_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand              TEXT NOT NULL,
    model              TEXT NOT NULL,
    year               INTEGER,
    engine_displacement INTEGER,
    registration_date  DATE,
    current_mileage    INTEGER NOT NULL DEFAULT 0,
    vin                TEXT,
    notes              TEXT,
    photo_url          TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_motorcycles_owner ON motorcycles(owner_id);

-- Components: individual parts tracked per motorcycle. Created before
-- maintenance_records because maintenance_records references components(id).
CREATE TABLE IF NOT EXISTS components (
    id                       BIGSERIAL PRIMARY KEY,
    motorcycle_id            BIGINT NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
    owner_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                     TEXT NOT NULL,
    category                 TEXT,
    installation_date        DATE,
    installation_mileage      INTEGER,
    replacement_date          DATE,
    replacement_mileage       INTEGER,
    expected_maintenance_interval INTEGER,
    notes                     TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_components_motorcycle ON components(motorcycle_id);
CREATE INDEX IF NOT EXISTS idx_components_owner ON components(owner_id);

-- Maintenance records: auditable history of operations on a motorcycle.
CREATE TABLE IF NOT EXISTS maintenance_records (
    id              BIGSERIAL PRIMARY KEY,
    motorcycle_id   BIGINT NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
    owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category        TEXT NOT NULL,
    operation_date  DATE NOT NULL,
    mileage         INTEGER,
    cost            NUMERIC(12,2),
    notes           TEXT,
    component_id    BIGINT REFERENCES components(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_motorcycle ON maintenance_records(motorcycle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_owner ON maintenance_records(owner_id);

-- Maintenance schedules: user-defined reminders (mileage and/or time based).
-- verified=false means manually configured; verified=true means manufacturer-confirmed.
CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id                   BIGSERIAL PRIMARY KEY,
    motorcycle_id        BIGINT NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
    owner_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category             TEXT NOT NULL,
    interval_mileage     INTEGER,
    interval_days        INTEGER,
    last_performed_mileage INTEGER,
    last_performed_date  DATE,
    verified             BOOLEAN NOT NULL DEFAULT FALSE,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedules_motorcycle ON maintenance_schedules(motorcycle_id);

-- Documents: metadata for files stored in S3, linked to motorcycles and
-- optionally to maintenance records.
CREATE TABLE IF NOT EXISTS documents (
    id              BIGSERIAL PRIMARY KEY,
    owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    motorcycle_id   BIGINT REFERENCES motorcycles(id) ON DELETE CASCADE,
    maintenance_id  BIGINT REFERENCES maintenance_records(id) ON DELETE SET NULL,
    filename        TEXT NOT NULL,
    content_type    TEXT,
    size_bytes      BIGINT,
    s3_key          TEXT NOT NULL,
    doc_type        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_motorcycle ON documents(motorcycle_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
"""


def main(args, ctx=None):
    if not ctx or not hasattr(ctx, "POSTGRESQL"):
        return {"success": False, "error": "Database not configured", "data": None}
    conn = ctx.POSTGRESQL
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()
        # Confirm core tables exist.
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = current_schema()
                  AND table_name IN ('users','motorcycles','maintenance_records',
                                     'maintenance_schedules','components','documents')
                ORDER BY table_name
            """)
            tables = [r[0] for r in cur.fetchall()]
        return {"success": True, "data": {"tables": tables}, "error": None}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return {"success": False, "error": str(e), "data": None}
