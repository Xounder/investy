# Local Docker-first stack

The default local runtime requires Docker Engine with Compose v2, not a host
Node.js or PostgreSQL installation. From the repository root, execute each
command separately:

Dockerfiles, Compose stacks, nginx configuration, and helpers live in `docker/`.
Compose resolves its relative paths from that directory; build contexts and
bootstrap mounts point back to the repository root. Private `.env.*.local`
files and `.dockerignore` remain at the root. Existing Compose project names
and named volumes are unchanged by this layout.

```text
docker compose -f docker/compose.bootstrap.yaml run --build --rm bootstrap
docker compose -f docker/compose.yaml config --quiet
docker compose -f docker/compose.yaml up --build -d --wait
```

Open `http://localhost:8080`. The web image serves compiled Vite assets with
an SPA fallback; nginx proxies `/api/` to the API on the private Compose
network. `/api` and `/api/*` always reach the API (never the SPA). Unknown
asset filenames return 404, while extensionless SPA deep links resolve to
`index.html`. Verify `http://localhost:8080/api/health` (process) and
`http://localhost:8080/api/ready` (read-only database connection, 503 on
failure), then exercise an authenticated database-backed flow. The ready
probe does not guarantee external provider availability. The `migrate` one-shot job must
complete successfully after PostgreSQL becomes healthy before API and worker
start. The worker runs compiled JavaScript, not the development `tsx` command.

For an explicit idempotent migration run and private operational diagnostics:

```text
docker compose -f docker/compose.yaml run --rm migrate
docker compose -f docker/compose.yaml logs migrate api worker
curl http://localhost:8080/api/ready
```

Do not paste container logs publicly; provider or driver errors could contain
operational details. `api` and `worker` use `restart: unless-stopped` for
process exits/daemon restarts. A Docker **unhealthy** status does not restart
containers automatically; after database recovery, verify `/api/ready` and
the worker logs. If they remain faulty, restart only these services:

```text
docker compose -f docker/compose.yaml restart api worker
```

`restart` does not reload changed environment files. To rotate a session
secret, use a new cryptographically random value in the ignored server file,
then **recreate** API and worker (`docker compose -f docker/compose.yaml up -d
--force-recreate api worker`); this intentionally invalidates existing
sessions. To rotate a PostgreSQL password on a **persisted** volume, first
change the actual `investy_local` database role credential through an
authorized private PostgreSQL administration procedure, then update both
ignored main-local files consistently and recreate db, API and worker.
Changing `POSTGRES_PASSWORD` alone does **not** update an initialized
PostgreSQL role. Never paste passwords into shell commands, logs, or tickets.

```text
docker compose -f docker/compose.yaml stop
```

Stop the stack after validation. `stop` retains the database and backup named
volumes (`investy-local-main_main_postgres_data` and
`investy-local-main_main_backup_data`). Never use `down --volumes` unless you
intend to destroy this **main-local** data. The bootstrap uses a separate
Compose project and mounts only the repository to create private settings.
It generates `.env.docker.local` (server-only connection URL and session
secret) and `.env.docker.postgres.local` (PostgreSQL password), checks both
paths against Git's actual index and effective ignore rules before any write,
and preserves matching existing settings. The bootstrap image includes Git
so the host needs only Docker. It refuses
partial or mismatched settings. Do not print, share, or commit either file.
The main database is `investy_local` reachable at Docker DNS name `db`, not
host loopback. No database port is published. Main API and worker share the
backup volume at `/app/.data/backups` (within the API's project root); the
backup verifier retains its existing 32 MiB-per-artifact limit. No secrets
are passed to Vite, nginx, or image build arguments. All local HTTP ports are
loopback-bound. If port 8080 is occupied, Compose reports the bind failure;
do not reconfigure the database to point at an existing installation.

Named volumes persist across stops but are not off-host backups. Retain and
verify off-host copies separately. For application-level recovery, use only
the existing validated internal `restoreExport` path: a complete archive
bounded by the 32 MiB verifier, an **existing empty owner**, ownership and
catalog validation, row-lock/tombstone checks, and transactional rollback.
There is no public restore endpoint or automated operator CLI in this setup.
Do not restore raw database dumps into a live instance: they could resurrect
erased users, overwrite other owners, or roll back erasure history. Arrange
an audited recovery procedure and off-host storage before relying on backups.

**Isolation:** For the Docker-only real-browser suite, see
[the E2E runbook](../apps/web/e2e/real/README.md). `docker/compose.e2e.yaml` uses the independent
`investy-local-e2e` project, `investy_e2e` database, and named PostgreSQL
and artifact volumes. Its browser and migration containers connect to
`postgres-e2e:5432` on their private network, while the optional host helper
uses `127.0.0.1:55432`. Neither stack reads the other's private file or
falls back to an ambient `DATABASE_URL`. Do not run E2E against the main stack.

This configuration is **local HTTP** (`NODE_ENV=development` for non-Secure
cookies). It is not a production deployment recipe: production requires TLS,
`NODE_ENV=production`, a matching HTTPS `APP_ORIGIN`, protected secret
management, durable off-host backups, and production operational review.

## Optional server-only provider token

To enable the supported brapi provider, open the ignored
`.env.docker.local` in a **local private editor** and append one line:

```text
BRAPI_API_KEY=<your private provider token>
```

Replace the placeholder in the private file, not in this document or a shell
command. Bootstrap preserves an existing valid token, requires the original
database URL and session secret, and rejects unknown variables. Only API and
worker receive the token; the migration service masks it to an empty value,
and web/build images never receive the private file. After adding, changing,
or removing it, recreate API and worker (a restart does not reload env files):

```text
docker compose -f docker/compose.yaml up -d --force-recreate api worker
```

## Static checks without Docker (optional host Node/pnpm)

Docker is the default runtime for both the app and E2E suite. If Docker is
unavailable, host Node/pnpm can **only** establish static and unit-test
evidence, not validate container builds, migrations, or real-DB browser
journeys. From the repository root run these existing package commands in
order, then check the persistent helpers' syntax:

```text
pnpm -C packages/domain build
pnpm -C apps/api build
pnpm -C apps/api typecheck
pnpm -C apps/api lint
pnpm -C apps/api test
pnpm -C apps/web build
pnpm -C apps/web typecheck
pnpm -C apps/web lint
node --check docker/private-files.js
node --check docker/init-local.js
node --check docker/init-e2e.js
node --check docker/run-e2e.js
node --check apps/api/test-support/local-e2e-db.js
```

The API test command exercises the real-Git bootstrap worktree tests, parsed
Compose graph and static nginx routing contract, and read-only readiness
route tests. These checks do not require creating real private credentials.
