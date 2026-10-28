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
