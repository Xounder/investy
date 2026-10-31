# TASK-15 persistent PostgreSQL browser suite

The default `pnpm test` in `apps/web` runs the original fixture-intercept Chromium
project, the independent production-bundle scan, and the real-postgres project.
Without `E2E_DATABASE_URL`, every real-postgres test **skips explicitly**. A
fixture result is not evidence of PostgreSQL integration.

1. Provision a **disposable, dedicated** PostgreSQL database with `test` or
   `e2e` in its database name. Never use a production or shared database. Set
   `E2E_DATABASE_URL` in the test command environment; do not commit its value.
2. Migrate only that database: from `apps/api`, set `DATABASE_URL` to the value
   of `E2E_DATABASE_URL` for that command, then run `pnpm db:migrate`.
   Migration is a separate, explicit operator action; Playwright does not
   auto-migrate or drop a database. The preflight verifies connectivity and
   the required tables before launching the API. If migration is missing,
   startup fails closed without printing the connection string.
3. Run package builds in order: domain, API, web. From `apps/web`, run
   `pnpm test`. Playwright owns both the API and the Vite proxy server for a
   real run and terminates them at completion; do not start them separately.
   Real project requires API `dist/index.js`. Its backend gets `DATABASE_URL`
   **only** from the dedicated `E2E_DATABASE_URL`, never from the ambient
   `DATABASE_URL`. No browser route interception substitutes for API calls.
4. Each test uses unique users; teardown deletes only its own user via the
   authenticated account-erasure API. Inspect failures before disposing of
   the disposable test database. Never run multiple suites against the same
   instance concurrently: the auth limiter and shared catalog are global.

The default fixture project retains its original configuration when
`E2E_DATABASE_URL` is unset. With it set, both projects use the same-origin
test proxy (`/api` to the Playwright-owned API); only the test-only Vite
configuration enables this proxy. The test database must have catalog assets
seeded at API boot. TASK-15 seeds owner-independent, fresh PETR4 quotes in
**real PostgreSQL** and recent owner-scoped snapshots. It inserts a tagged
Yahoo-unit IBOV index close only if the date has no existing close; existing
verified closes are read and used as the expected values, never overwritten.
Cleanup removes only fixture-created rows; owner snapshots are deleted by
owner erasure. Do not run concurrent suites against one test database.

Before importing the compiled Hono app, the **test-only** launcher installs
deterministic `fetch` responses for exact external brapi PETR4 quote and BCB
SGS 11/12 daily-rate endpoints. The SGS fixture uses weekday dates, NOT the
official Brazilian 2026 holiday calendar. Other external hosts receive 503;
localhost HTTP is unchanged. These fixtures are not browser `page.route`
intercepts and do not replace the API, cookie sessions, SQL queries, or DB.
The official 2026 B3 equity-session calendar has passed independent QA against
the January 9 B3 announcement and Bora Investir references, including the
365-day fixture and Ash Wednesday's afternoon session. The weekday-only SGS
provider fixture above is not that calendar. Live-provider, PostgreSQL-backed
browser, worker-runtime, and Docker validation remain unverified. Do not claim
the real cases pass until the migrated test database has actually run.

## Docker-only PostgreSQL and Playwright (preferred)

Only Docker Engine with Compose v2 is required on the host. From the
repository root, execute these commands individually:

```text
docker compose -f docker/compose.bootstrap.yaml run --build --rm e2e-bootstrap
docker compose -f docker/compose.e2e.yaml --profile browser config --quiet
docker compose -f docker/compose.e2e.yaml --profile browser build migrate-e2e browser-e2e
docker compose -f docker/compose.e2e.yaml --profile browser run --rm browser-e2e
docker compose -f docker/compose.e2e.yaml stop
```

The bootstrap creates or checks the ignored `.env.e2e.local` (host URL) and
`.env.e2e.postgres.local` (password only), without revealing credentials or
overwriting existing settings. Bootstrap checks both paths against Git's actual index and effective ignore
rules before writing; it fails closed if either destination is tracked or
unignored. The `browser` profile starts PostgreSQL,
waits for its health check, runs the one-shot compiled-API migration job, and
then executes Playwright in the official `v1.60.0-noble` browser image. It
installs dependencies and builds domain, API, and web inside that image. The
test runner uses `postgres-e2e:5432` within Docker; `127.0.0.1:55432` is
**only** for the optional host helper. Neither the main-local database nor
the main-local private files are used. Both the fixture and real projects run
under the existing Playwright config; the real project launches its own API
and Vite proxy on the browser container's localhost. The separate database
is migrated explicitly by the dependency job, never by Playwright.
Expect the existing fixture cases, production-bundle scan, and real-postgres
cases to be discovered; only a completed Docker run establishes pass counts.
A skipped real case is not evidence of real-DB integration.

The `run` command returns the browser suite's exit code. Always execute
`stop` after the suite, including after failure. The profile stores browser
artifacts in its dedicated `e2e_test_results` and `e2e_playwright_report`
named volumes; the database and private files persist. Never use `down -v`
for either Compose project. The official browser image includes Chromium
and shared-memory is sized explicitly. Both migration and browser commands
verify all checked-in migration hashes before reporting success. Do not
launch another suite against the same E2E database concurrently. Docker configuration and runtime status
must be checked before claiming any test has passed.

## Optional host Node/pnpm wrapper

Requires Docker Engine with Compose v2, Node/pnpm, and an available loopback
port 55432. From the repository root, run the following **one command at a
time**. The helper never reads the regular `.env` or reuses `DATABASE_URL`.
It uses a separate Compose project (`investy-local-e2e`), service
(`postgres-e2e`), and named volume (`e2e_postgres_data`), not the development
database or its volume. `init` checks Git's ignore rule and creates or
preserves the same E2E private files used by the Docker browser profile.
Keep these files out of version control and never expose their contents.

```text
node apps/api/test-support/local-e2e-db.js init
node apps/api/test-support/local-e2e-db.js up
node apps/api/test-support/local-e2e-db.js migrate
node apps/api/test-support/local-e2e-db.js status
```

`status` verifies the database identity and migration hashes against the
checked-in Drizzle journal; it does not auto-migrate. Build domain, API, and
web in that order using the normal package build commands, then run:

```text
node apps/api/test-support/local-e2e-db.js test
node apps/api/test-support/local-e2e-db.js down
```

The test wrapper supplies `E2E_DATABASE_URL` **only to its pnpm test child**;
Playwright passes it to the test-only API launcher, which in turn sets its
child `DATABASE_URL`. It does not modify Playwright configuration or Vite
variables and never falls back to a main database. The `test` wrapper stops
its own Compose service in a `finally` block, even after a test failure. Run
`down` if stopping before testing; it stops only this Compose service while
preserving the private file and isolated volume for the next run. `up` will
fail if the port is unavailable; do not change to port 5432 or point the
helper at any shared database. Docker Compose is not needed for fixture-only
tests: without `E2E_DATABASE_URL`, the original real suite still skips.
