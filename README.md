# MotoLab — Digital Motorcycle Garage

MotoLab is a full-stack serverless application for motorcycle owners to register
and manage their motorcycles, monitor mileage and maintenance schedules, record
repairs and maintenance operations, track individual components, and store
photographs, receipts and technical documents.

It feels like a professional motorcycle diagnostic workstation — a cyber‑industrial
dark interface combined with a real frontend/backend architecture.

## Tech Stack

| Layer      | Technology |
|------------|-----------|
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS, React Router (HashRouter), TanStack Query, lucide-react, shadcn/ui primitives |
| Backend    | Python 3.12 OpenServerless / Apache OpenWhisk web actions |
| Database   | PostgreSQL (primary relational store) |
| Sessions   | Redis (opaque session tokens) |
| Storage    | S3-compatible object storage (documents, photos) |
| Future     | Milvus (semantic search), FerretDB (documents) — extensible, not in MVP |

## Features

- **Authentication** — register/login with bcrypt-hashed passwords and Redis-backed
  opaque session tokens. Every protected request derives identity from the
  validated session, never from a browser-supplied user id.
- **Dashboard** — selected motorcycle, mileage, maintenance status, upcoming
  maintenance, recent history, component status overview. All derived from real data.
- **My Garage** — full motorcycle CRUD with ownership, multiple motorcycles per user.
- **Maintenance** — operation history with categories, dates, mileage, costs, notes.
- **Components** — track parts, installation/replacement mileage and expected intervals.
- **Documents** — S3 presigned upload flow, confirm + metadata, list, download, delete.

## Getting Started

This app runs inside a Trustant workbench. The managed `ops ide devel` watcher
owns packaging and deployment of OpenServerless actions.

```bash
# Install frontend dependencies
npm install

# Production build
npm run build
```

The Vite dev server is managed at `http://localhost:5173`. Do not start another.

## Database Setup

Schema initialization is idempotent and lives in the private action
`packages/setup/database/database.py`. After schema changes:

```bash
timeout 120 ops ide setup
```

## API

All browser-facing endpoints live under package `v1` and are reachable at
`/api/my/v1/<action>`. See [docs/API.md](docs/API.md) for the full contract.

Consistent response envelope:

```json
{ "success": true, "data": {}, "error": null }
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture and request flow
- [docs/DATABASE.md](docs/DATABASE.md) — schema and entity relationships
- [docs/API.md](docs/API.md) — endpoint reference with examples
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment and environment notes

## Security

- Bcrypt password hashing; no plaintext passwords stored.
- Opaque session tokens stored in Redis with a bounded TTL; browser persists only
  the token.
- Every protected action validates the token against Redis and derives the user
  id from the session record.
- Ownership verification on every motorcycle-scoped resource.
- Parameterized SQL everywhere; no string interpolation in queries.
- S3 uploads use presigned URLs scoped to the owner's key prefix.
- No secrets in frontend code; `.env` is an immutable boundary managed via Trustant.
