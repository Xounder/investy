# ADR-011: Docker-First Runtime and Isolated E2E

**Status:** Accepted

**Date:** 2026-10-27

## Context

The approved full-stack design uses PostgreSQL, a Node API and worker, and a React SPA (ADR-001/002/004/007). ADR-008 originally selected a managed Postgres/hosted deployment option. The user now explicitly requires Docker for the principal database and as much of the stack as practical. TASK-15's QA-approved real-DB harness cannot run here until Docker CLI/daemon are available (CLI currently ENOENT). This decision documents a new local/default packaging and test path; it does not rewrite the historical hosting choice or assert runtime validation that has not occurred.

## Decision

- **Default local/full-stack bootstrap:** Compose provisions PostgreSQL, a migration job, API, independently running worker and static SPA behind a same-origin reverse proxy. Build images from the pnpm workspace and run compiled production entrypoints. Use a named durable Postgres volume and a separate persistent worker-backup volume. No host PostgreSQL or host DB credential is required for this Docker path.
- **Isolated E2E:** a different Compose project, network, generated secrets and database volume (optionally a version-matched Playwright runner profile) bootstraps migrated test data for TASK-15; cleanup cannot address the main database or backup volume. Do not repurpose existing development/production databases.
- **Secret/transport boundaries:** generated local-only ignored credentials are injected at runtime, never baked into images, frontend assets or committed files. Expose only the intended web proxy; API and database stay internal by default. Compose is not an HTTPS/TLS deployment: production requires a trusted TLS terminator, secure-cookie and origin/CORS settings, durable storage and off-host backups.
- **Portable deployment:** the same compiled application images can target an external managed PostgreSQL and platform TLS/storage when desired. ADR-008's managed-service option remains available; Docker-first is the new default integration/development path, not a claim of self-hosted production security or automatic verified backups.
- **Evidence boundary:** Docker/real-DB steps remain blocked when CLI or daemon are unavailable; static/Node checks may pass independently. Container health, migrations, worker execution and Playwright real-DB results require actual runtime validation and explicit QA.

## Consequences

- One repeatable way to provision the main stack and a separate test stack without host database setup; migrations and cookie same-origin routing become deployable infrastructure contracts.
- Operators must manage container updates, disk capacity, backup verification and TLS in self-hosted environments; Compose volumes alone do not replace managed PostgreSQL resilience or off-host backups.
- TASK-19 owns infrastructure delivery. TASK-15 final real-DB acceptance depends on it. TASK-10's 2026 equity calendar was subsequently code-QA approved against the official January 9 references and a 365-day fixture (14 weekday closures and 247 inferred sessions); live worker/database validation remains separate.

## Alternatives Considered

- **Host-installed PostgreSQL for the main stack:** rejected for the new Docker-first default; host use remains optional, never required for Compose bootstrap.
- **Use main DB for E2E:** rejected due to data loss and cross-user isolation risks.
- **Replace ADR-008 with a production TLS/backup claim:** rejected; Compose does not provide those guarantees on its own.
