# TASK-19 — Docker-First Full Stack and Isolated E2E Closure

## Task Information

- **ID:** TASK-19
- **Title:** Docker-first main stack and isolated real-PostgreSQL E2E bootstrap
- **Owner:** senior-backend
- **Status:** In progress (backend integration started; runtime validation blocked by Docker ENOENT)

## Description

Implement the user's new Docker-first requirement, including the **main database**, while retaining the managed-PostgreSQL deployment option in [ADR-008](../../../architecture/docs/adrs/ADR-008-hosting-deployment.md). Compose must bootstrap a working PostgreSQL/API/worker/web stack and a separate, disposable-by-name E2E stack for TASK-15. Integrate the approved TASK-15 real-database harness and the backend's existing partial `compose.e2e.yaml`/local E2E helper rather than replacing their work. Docker CLI currently returns ENOENT: do not claim container startup, migrations, real E2E passes or runtime verification until a daemon is available.

## Acceptance Criteria

- [ ] Provide root Compose/Dockerfiles/ignore rules and minimal build/runtime helper(s) for main PostgreSQL, API, separately launched worker, static SPA served through a same-origin reverse proxy, and an explicit one-shot migration job. Use workspace-aware, reproducible pnpm/TypeScript builds and **compiled runtime entrypoints**, not a source-only or dev-server-only image. Gate API/worker readiness on successful migrations and database health; health checks, startup/restart, volume ownership and orderly shutdown are documented.
- [ ] Main PostgreSQL has a **named persistent data volume** and is private to the Compose network by default (no required host PostgreSQL or host database credentials). Backups use a separately mounted, persistent volume shared only with the services that need it; document backup verification size/retention/restore limitations without claiming local volumes are off-host backups. The main stack must not reuse E2E volumes or credentials.
- [ ] SPA and cookie-auth API share one browser-facing origin via reverse proxy, including `/api` routing, SPA history fallback and health routing. Bind publicly only the intended web entry point; document external TLS/HTTPS termination, secure-cookie and proxy/CORS settings as deployment requirements rather than claiming Docker Compose alone provides production TLS.
- [ ] Separate E2E Compose project/name/volumes/network/port and generated local-only credentials: bootstrap dedicated empty database, apply versioned migrations, seed deterministic isolated fixtures and wire TASK-15's **ten real-PostgreSQL cases** plus optional Docker Playwright runner/profile with matching repository Playwright/browser version. Stop/cleanup targets must never destroy or alter the main or pre-existing dev/prod database. Distinguish real DB evidence from fixture-backed tests and skipped cases.
- [ ] Generate ignored, namespaced secrets using a non-interactive, safe bootstrap (or document secure injection); no hard-coded passwords, provider keys, session secrets, real `.env`, secrets in build args, frontend bundle, image layers, committed samples or test logs. Show operators how to provide provider keys outside images and rotate local secrets; no host `DATABASE_URL` needed for the Docker bootstrap.
- [ ] Document copyable local bootstrap, migration, logs/health, E2E run and non-destructive cleanup commands and Docker-unavailable diagnostics; include a static/Node verification path for Compose/config/build-contract checks when Docker is missing. Execute package builds/static/Node checks as feasible; container startup and real-DB Playwright only when daemon exists. QA must report exact pass/skip/block counts and remaining live provider/worker/DB deferrals.
- [ ] Stay within infrastructure scope: root Compose/Dockerfiles/.dockerignore, helper scripts, deployment/E2E docs and **new** infrastructure tests or necessary Node configuration; do not edit UI business logic, journal/domain/migrations, pre-existing tests or unrelated project configuration merely to make checks pass. Keep authored files <=400 lines.

## Dependencies

### Required Tasks

- TASK-01 — pnpm workspace, compiled package outputs and test harness exist.

### Dependency Notes

Consume the **approved TASK-15 code scaffold** and existing TASK-10 worker entrypoint, but do **not** depend on full TASK-15 or full TASK-10 task completion: TASK-15 requires TASK-19 for real-DB verification, and TASK-10's B3 full-year/calendar QA is independent of packaging. This avoids a cycle and keeps calendar review separate. Once TASK-19's container runtime is actually verified, TASK-15 can execute real E2E; no test skipped due to missing Docker becomes a pass.

## Technical Context

- [ADR-011](../../../architecture/docs/adrs/ADR-011-docker-first-runtime.md), [architecture](../../../architecture/architecture.md), [TASK-15](TASK-15-e2e-hardening.md), existing root `compose.e2e.yaml`, local E2E bootstrap helper, deployment docs and worker entrypoint; inspect files before modifying. ADR-002 workspace dependency direction, ADR-004 PostgreSQL cents, ADR-006 session isolation, ADR-007 worker/backups and ADR-010 secrets apply unchanged.

## Implementation Guidance

- **File Overlap Warning:** root E2E Compose/helper/deployment docs may already be under active senior-backend implementation and TASK-15 owns real-browser specs and harness. **Merge strategy: sequential** for identical root files: inspect and integrate the backend's current work when it lands; preserve approved TASK-15 test scaffolding, do not replace it or edit its existing tests. Different root Compose/adapter/docs sections may be developed in parallel only after ownership is separated. `.opencode/` planning/state changes are orchestrator-owned after this handoff.
- Avoid a mandatory registry push, platform-specific cloud dependencies or privileged host-level changes. Main volumes must survive routine `down`; any destructive `down --volumes` command belongs only to a clearly labeled, confirmed E2E project. Compose health must distinguish DB liveness, migration completion and API readiness.

## Edge Cases

- **Races:** two migration attempts/API starts, DB restart while worker runs, concurrent E2E runs with identical project names; serialize migrations and isolate test projects or fail safely before data mutation.
- **Empty/missing:** new data volume, absent optional provider key, missing generated secrets or missing browser image: actionable preflight failure or truthful degraded market status; no fabricated credentials or implicit host DB fallback.
- **Failures:** Docker CLI ENOENT/daemon down, image build/offline pulls, permission denied on volumes, disk quota/full backups, corrupt migrations, health timeout and reverse-proxy 502 must not be mislabeled as success or trigger main-data cleanup.
- **Limits:** backup artifact size cap, large multipart imports, many migrations, provider rate limits, browser memory and mismatched Playwright image version; bound resources and report deferrals accurately.
- **Regressions:** existing host development, approved TASK-15 fixture tests, main database contents, owner-isolation/cookie behavior, package builds and deployable managed-Postgres images remain intact.

## Testing

- [ ] Static/Node tests assert config contract, secret exclusion, project/volume isolation, migration ordering and route/proxy wiring without requiring an available Docker daemon.
- [ ] With Docker available: build images, run main health/migration/bootstrap, exercise cookie-auth same-origin API and worker, run isolated E2E real-DB cases and verify main volume survives E2E cleanup; capture real results separately from skipped tests. Do not manage unrelated OS processes.
- [ ] Validate affected package build/typecheck/lint/test via approved package tool; explicitly defer Docker runtime checks while CLI remains ENOENT.

## Definition of Done

- [ ] Documentation/config/tests/code QA approved; full operational acceptance requires actual Docker daemon validation and isolated real-DB TASK-15 tests. No false completion or skipped-as-passed reporting; task commit per pipeline pattern only after QA.

## References

- [Architecture](../../../architecture/architecture.md) · [ADR-011](../../../architecture/docs/adrs/ADR-011-docker-first-runtime.md) · [ADR-008](../../../architecture/docs/adrs/ADR-008-hosting-deployment.md) · [TASK-15](TASK-15-e2e-hardening.md)
