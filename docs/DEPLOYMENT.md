# Deployment

## Managed deployment

MotoLab runs inside a Trustant workbench. The `ops ide devel` watcher is the sole
owner of OpenServerless action packaging and deployment. Source changes to action
modules under `packages/` are picked up and deployed automatically.

- **Frontend**: built by Vite (`npm run build`) and served from the managed dev
  server at `http://localhost:5173`. Do not start another Vite server.
- **Backend**: action modules live in `packages/<package>/<action>/<module>.py`.
  Generated `__main__.py` wrappers and `*.zip` archives are watcher-owned — never
  edit or create them manually.

## Schema initialization

After schema changes in `packages/setup/database/database.py`:

```bash
timeout 120 ops ide setup
```

The setup action is idempotent (`CREATE TABLE IF NOT EXISTS`).

## Action contract check

```bash
timeout 60 check_openserverless_actions.sh .
```

## Frontend build & validation

```bash
npm run build              # production build
npx tsc --noEmit           # typecheck
```

Use the deterministic `react_validate` MCP tool after frontend mutations.

## Environment

Application `.env` and `.env.production` are immutable agent boundaries managed
through the Trustant configuration interface. The generated action wrappers
receive service bindings as action parameters (`REDIS_URL`, `REDIS_PREFIX`,
`POSTGRES_URL`, and for documents `S3_*`) — never hardcode credentials in source.

| Variable | Scope | Notes |
|----------|-------|-------|
| `POSTGRES_URL` | action param | PostgreSQL connection (generated wrapper) |
| `REDIS_URL` | action param | Redis connection (generated wrapper) |
| `REDIS_PREFIX` | action param | Session key namespace; build keys from `ctx.REDIS_PREFIX` |
| `S3_HOST` / `S3_PORT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | action param | Object storage (documents action only) |
| `S3_BUCKET_DATA` | action param | Private data bucket (`<user>-data`) |
| `S3_BUCKET_STATIC` | action param | Public web bucket (`<user>-web`) |

`OPS_USER`, `OPS_PASSWORD`, `OPS_APIHOST`, `OPS_REPO`, `OPS_SKILLS` are
Trustant orchestration variables and must never be bound into actions.

## Verification

From inside the pod, validate against the managed dev server:

```bash
curl http://localhost:5173/api/my/v1/me
curl -X POST http://localhost:5173/api/my/v1/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"rider@test.com","password":"supersecret","name":"Rider"}'
```

External browser verification uses the `vite.<domain>` ingress only after the
managed watcher has deployed current sources.
