# Deployment and verification

For the isolated, Docker-first **local** application stack, see the [Docker guide](DOCKER.md).

Deploy the React web build and Hono API on the same origin (reverse-proxy
`/api` to the API; SPA fallback serves `index.html`). Set `APP_ORIGIN` to the
exact public web origin. Browser requests carry httpOnly session cookies; use
HTTPS with `NODE_ENV=production` so cookies are Secure. Do not put provider
keys, connection strings, or session secrets in Vite environment variables.

Set `DATABASE_URL` (PostgreSQL), `SESSION_SECRET` (strong, private),
`APP_ORIGIN`, `PORT` (defaults to 3000), and `NODE_ENV=production` for the
server. `BRAPI_API_KEY` is optional for provider-backed market data.
Set `BACKUP_DIR` to a writable **persistent** volume for the API/worker
backup artifact **inside the project root** (no symlink escaping the root).
The backup verifier has a strict 32 MiB per-artifact cap: larger exports are
not verified backups. A mounted volume is not a cloud-backup guarantee; test
durable off-host copies and restore before relying on it. Supply the same database and backup storage to the worker;
keep worker and API secrets in server-side secret storage. See [`.env.example`](../.env.example)
for variable names, not production values. `E2E_DATABASE_URL` is test-only
and must never be set to the production `DATABASE_URL`.

Build domain, API, then web (`pnpm build` in each package). Apply migrations
with `pnpm db:migrate` from `apps/api` against the intended database before
starting `pnpm start` from `apps/api`; run `node dist/worker/index.js` from
`apps/api` as the separate **production** worker process (`pnpm worker` uses
development `tsx`). Verify `GET /api/health` returns HTTP 200 and
`{"status":"ok"}` through the reverse proxy; this is a process health
check, not a guarantee that PostgreSQL or market providers are available.
Verify database-backed auth separately. Verify persistent backup status and
restore procedures before relying on backups. Use the dedicated test-runbook
at [the E2E runbook](../apps/web/e2e/real/README.md) for isolated real-DB browser validation.
