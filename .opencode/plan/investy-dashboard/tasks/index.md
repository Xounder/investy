# Investy — Task Index

Pipeline: `investy-dashboard` · Step: tech-lead · Status: created

## Overview

19 implementation tasks from approved design docs (design-01..07), architecture (ADR-001..011), and the user's explicit Docker-first principal-database requirement. TASK-16/17 close reports/import gaps; TASK-18 closes TASK-15 journey readiness; TASK-19 supplies the main full-stack Docker bootstrap and isolated real-DB E2E environment. The original ≈40 dev-day design-07 estimate predates these additions and has not been recalculated. Preserve current pipeline statuses (this index is a task graph, not a status ledger).

## Task List

| # | Title | Owner | Est. | Depends On |
|---|-------|-------|------|------------|
| TASK-01 | Monorepo Foundation, Domain Skeleton, CI, Test Harness (M0) | senior-backend | 3d | — |
| TASK-02 | Domain Engine — JournalEngine, Money, FX, Rateio (M1) | senior-backend | 4d | TASK-01 |
| TASK-03 | Authentication, Ownership, Database Schema (M2) | senior-backend | 3d | TASK-01, TASK-02 |
| TASK-04 | Market Data Proxy and Asset Catalog (M3) | senior-backend | 4d | TASK-01, TASK-02, TASK-03 |
| TASK-05 | REST API Endpoints — Journals, Holdings, Portfolios (M4 API) | senior-backend | 4d | TASK-02, TASK-03, TASK-04 |
| TASK-06 | UI Foundation — Tailwind Theme, Design System, Layout, Routing (M0 FE) | senior-frontend | 3d | TASK-01 |
| TASK-07 | Register Drawer, Journal Screen, Holdings Table (M4 FE) | senior-frontend | 4d | TASK-05, TASK-06 |
| TASK-08 | CSV Template Import and B3 Nota Import (M5) | senior-backend | 4–5d | TASK-02, TASK-03, TASK-05 |
| TASK-09 | Dividend Tracking — Agenda, Projection, Income History (M6) | senior-backend | 3d | TASK-03, TASK-04, TASK-05, TASK-06 |
| TASK-10 | Scheduled Worker — Quotes, Snapshots, Dividend Sync, Backups (M7 Worker) | senior-backend | 4d | TASK-02, TASK-03, TASK-04 |
| TASK-11 | Dashboard Hub — KPIs, Indicators, Allocation, Performance (M7 FE) | senior-frontend | 4d | TASK-05, TASK-06, TASK-09 |
| TASK-12 | Reports & Analytics Screen (M8 FE) | senior-frontend | 3d | TASK-05, TASK-06, TASK-09, TASK-10 |
| TASK-13 | Export, Backup Status, and Account Erasure API (M8 BE) | senior-backend | 2d | TASK-03, TASK-05 |
| TASK-14 | Settings Screen — Profile, Portfolios, Export, Danger Zone (M8/M9 FE) | senior-frontend | 3d | TASK-13, TASK-06 |
| TASK-15 | E2E Testing, Isolation, Security, Deploy Config (M9) | senior-frontend | 3–4d | TASK-07..12, TASK-14, TASK-16, TASK-17, TASK-18, TASK-19 |
| [TASK-16](TASK-16-canonical-reports-api.md) | Canonical reports API, truthful coverage (M8 gap) | senior-backend | gap scope | TASK-05, TASK-09, TASK-10 |
| [TASK-17](TASK-17-import-ui.md) | CSV + nota preview/confirm/history UI (M5 gap) | senior-frontend | gap scope | TASK-06, TASK-07, TASK-08 |
| [TASK-18](TASK-18-auth-onboarding-daily-check-integration.md) | Auth/onboarding, asset override, reports-export UI integration | senior-frontend | gap scope | TASK-03, TASK-06, TASK-07, TASK-14 |
| [TASK-19](TASK-19-docker-first-stack-e2e.md) | Docker-first main PostgreSQL/API/worker/web and isolated E2E stack | senior-backend | new user requirement | TASK-01 (consumes TASK-15 approved scaffold, not its full completion) |

## Dependency Graph

```text
TASK-01 (Foundation)
├── TASK-02 (Domain Engine)
│   ├── TASK-03 (Auth + DB)
│   │   ├── TASK-04 (Market Proxy)
│   │   │   ├── TASK-05 (API Endpoints)
│   │   │   │   ├── TASK-07 (Journal + Holdings UI) ◄── TASK-06 (UI Foundation)
│   │   │   │   ├── TASK-08 (CSV + Nota Import)
│   │   │   │   ├── TASK-09 (Dividends) ◄── TASK-04, TASK-06
│   │   │   │   ├── TASK-13 (Export + Erasure API)
│   │   │   └── TASK-10 (Worker)
│   │   └── TASK-09, TASK-10 (also depend on TASK-04)
│   └── TASK-08, TASK-10 (also depend on TASK-02)
└── TASK-06 (UI Foundation)
    ├── TASK-07 (Journal + Holdings UI) ◄── TASK-05
    ├── TASK-09 (Dividends UI deps) ◄── TASK-05
    ├── TASK-11 (Dashboard UI) ◄── TASK-05, TASK-09
    ├── TASK-12 (Reports UI) ◄── TASK-05, TASK-09, TASK-10
    └── TASK-14 (Settings UI) ◄── TASK-13

TASK-05 + TASK-09 + TASK-10 ──► TASK-16 (canonical reports API) ──► TASK-15
TASK-06 + TASK-07 + TASK-08 ──► TASK-17 (operative import UI) ──► TASK-15
TASK-03 + TASK-06 + TASK-07 + TASK-14 ──► TASK-18 (approved journey integration) ──► TASK-15
TASK-01 ──► TASK-19 (Docker main + isolated E2E bootstrap) ──► TASK-15 (real DB validation)
TASK-15 (E2E + Hardening) ◄── TASK-07..12, TASK-14, TASK-16, TASK-17, TASK-18, TASK-19
```

## Ownership Mapping

| Owner | Tasks | Total Est. |
|-------|-------|------------|
| senior-backend | TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-08, TASK-09, TASK-10, TASK-13, TASK-16, TASK-19 | original ≈30–31d + new Docker requirement |
| senior-frontend | TASK-06, TASK-07, TASK-11, TASK-12, TASK-14, TASK-15, TASK-17, TASK-18 | original ≈20–21d + gaps |

## File Overlaps

| File | Tasks | Merge Strategy |
|------|-------|----------------|
| `apps/api/src/db/schema.ts` | TASK-03, TASK-04, TASK-05, TASK-08, TASK-10 | Sequential: TASK-03 creates the schema; TASK-04 adds Quote/Asset tables; TASK-05/TASK-08/TASK-10 consume it. No file merge needed — sequential execution in dependency order. If ever parallelized, merge at table level (each task adds distinct tables). |
| `apps/api/src/middleware/auth.ts` | TASK-03, TASK-05, TASK-13 | Sequential: TASK-03 creates middleware; TASK-05 and TASK-13 consume it. No conflict — consumers import only. |
| `apps/api/src/index.ts` (Hono app entry) | TASK-03, TASK-04, TASK-05, TASK-08, TASK-09, TASK-13 | Sequential: each task registers its own route module (`/auth`, `/market`, `/transactions`, `/import`, `/dividends`, `/export`). Parallel risk: conflicting route registration — mitigate by `app.route('/api/v1/auth', ...)`, `app.route('/api/v1/market', ...)`, etc. Merge strategy: sequential preferred; if parallel, section-level merge at the route-registration block. |
| `apps/api/src/repositories/` (base layer) | TASK-03, TASK-05, TASK-13 | Sequential: TASK-03 creates the base scoped repository; TASK-05/TASK-13 add entity-specific repositories. No conflict — new files per entity. |
| `apps/web/src/stores/ui.ts` | TASK-06, TASK-07 | Sequential: TASK-06 creates the store; TASK-07 adds drawer/portfolio state slices. If parallelized: merge at the store-slice level (distinct slices per feature). |
| `apps/web/src/lib/api.ts` | TASK-06, TASK-07, TASK-09, TASK-11, TASK-12, TASK-14 | Sequential: TASK-06 creates the client and shared type; subsequent tasks ADD endpoint methods only (do not modify existing functions). If parallelized: add methods in distinct sections per resource — avoid editing shared fetch/error helpers. |
| `apps/web/src/components/charts/theme.ts` | TASK-06, TASK-11, TASK-12 | Sequential: TASK-06 creates the theme; TASK-11/TASK-12 consume it. If parallelized: merge at const level — each adds its own palette constants; do not edit shared axis/tooltip helpers. |
| `apps/web/src/app.tsx` | TASK-06, TASK-07 | Sequential: TASK-06 creates root with providers; TASK-07 adds routes. If parallelized: TASK-07 only edits the route table section. |
| `apps/web/playwright.config.ts` | TASK-01, TASK-15 | Sequential: TASK-01 configures Playwright harness; TASK-15 adds test projects/spec paths. No conflict — TASK-15 extends only. |
| `apps/api/src/app.ts` (actual API route mount) | TASK-03/04/05/08/09/10/13, TASK-16 | Parallel with careful merge of reports route-registration section only; if identical lines change concurrently, merge sequentially. Preserve all existing mounts. |
| `apps/web/src/lib/api.ts` and web route table | TASK-06/07/09/11/12/14, TASK-17 | Parallel with careful merge in import-specific API methods/route entries; preserve shared helpers. Merge identical-line edits sequentially. |
| `apps/web/tests/e2e/` | TASK-17, TASK-15 | Sequential: TASK-17 adds import-specific E2E, TASK-15 runs full six-journey suite after the live UI lands. |
| `apps/web/src/lib/api.ts`, auth/onboarding pages and web routes | TASK-06/07/14/17, TASK-18 | Sequential integration of already landed modules: extend auth/owner-aware methods and onboarding routes only; retain shared helpers. Backend auth-contract verification runs independently in parallel. |
| Asset detail drawer and quote/valuation cache keys | TASK-07/11/14, TASK-18 | Sequential: add write/reset to existing read-only drawer, preserve read path and invalidate existing scoped keys after success; merge identical-line edits only after other task lands. |
| Reports page/CTA and fixture browser specs | TASK-12/14/15, TASK-18 | Sequential for source edits and TASK-15 tests: add a small Settings export link; TASK-15 tests start after UI is ready. Fixture browser specs may live in distinct files but preserve shared setup. |
| Root `compose.e2e.yaml`, local E2E helper and deployment/E2E docs | TASK-15 scaffold, TASK-19, in-flight senior-backend E2E bootstrap | **Sequential** on identical files: preserve approved TASK-15 scaffold and ongoing backend edits; merge after the current implementation lands. New main Compose/Dockerfiles/volume docs can be separate files, but never overwrite existing E2E resources or tests. |

## Parallelization Plan

### Batch 1: Foundation (sequential, single task)
- **TASK-01** (Backend) — Monorepo scaffold. Must complete first.
- Rationale: every other task depends on the workspace structure.

### Batch 2: Domain + UI Foundation (parallel — backend + frontend)
- **TASK-02** (Backend) — Domain engine
- **TASK-06** (Frontend) — UI foundation
- Rationale: independent (domain math vs UI shell). Exploits the two agents maximally.

### Batch 3: Auth + ongoing frontend (parallel — backend + frontend)
- **TASK-03** (Backend) — Auth + ownership + DB schema
- TASK-06 continues if not complete (or QA of foundation can start)
- Rationale: TASK-03 depends on TASK-02; frontend track continues independently.

### Batch 4: Market Proxy + Worker (backend — sequential, technically necessary)
- **TASK-04** (Backend) — Market proxy + catalog
- **TASK-10** (Backend) — Worker — depends on TASK-04 (shares QuoteProvider/schema)
- Rationale: same-agent chain is technically unavoidable here (worker consumes the proxy); do not parallelize. Frontend tasks not yet blocked by backend can still proceed (TASK-07.. wait on TASK-05).

### Batch 5: API + Dashboard (parallel — backend + frontend)
- **TASK-05** (Backend) — REST API endpoints (the frozen contract, design-04)
- **TASK-11** (Frontend) — Dashboard UI — depends on TASK-05, TASK-06, TASK-09
- Rationale: TASK-11 consumes the aggregate endpoints from TASK-05. Contract is frozen (design-04), so the frontend can build against the endpoint table while the backend implements it — but safer to start TASK-11 after TASK-05 lands. Recommended: run TASK-05 first, then TASK-11 in parallel with TASK-08.

### Batch 6: Import + Journal UI + Dividends + Export API (parallel — 3 backend-with-UI mix)
- **TASK-08** (Backend) — CSV + nota import
- **TASK-07** (Frontend) — Journal + holdings UI
- **TASK-09** (Backend) — Dividends
- **TASK-13** (Backend) — Export + erasure API
- Rationale: TASK-07 depends on TASK-05+06; TASK-08 depends on TASK-02/03/05; TASK-09 depends on TASK-04/05/06; TASK-13 depends on TASK-03/05. All four are mutually independent. Frontend agent works TASK-07; backend agent picks among TASK-08/TASK-09/TASK-13.

### Batch 7: Reports + Settings (parallel — frontend only, distinct files)
- **TASK-12** (Frontend) — Reports UI
- **TASK-14** (Frontend) — Settings UI — depends on TASK-13
- Rationale: both frontend; files disjoint (reports components vs settings components). Parallel with careful section-level merge in `apps/web/src/lib/api.ts` (distinct resource methods).

### Batch 8: Approved-scope gap closures (parallel — backend + frontend)
- **TASK-16** (Backend) — mount canonical performance/income reports API against existing truthful sources.
- **TASK-17** (Frontend) — replace nota placeholder with working CSV/nota import UI against TASK-08 APIs.
- Rationale: distinct packages and frozen approved contracts; no dependency between them. TASK-12's mounted-source adapter can continue independently. Keep TASK-10's calendar/live-DB deferrals explicit.

### Batch 9: Approved journey integration + parallel contract verification
- **TASK-18** (Frontend) — API-backed auth/onboarding, asset override write/reset and Reports→Settings export entry. Backend agent independently verifies persisted registration/session contracts and returns exact API shapes; do not presume TASK-03 bug or alter its state.
- Rationale: TASK-16/17 are already code QA-approved (TASK-16 live provider/DB deferrals remain); neither is a direct dependency for TASK-18. Frontend preparation and backend verification can overlap; a verified missing backend contract must be resolved before signup acceptance.

### Batch 10: Docker-first main stack and test provisioning
- **TASK-19** (Backend) — main Docker PostgreSQL/API/worker/migration/web and isolated E2E Compose, images, secrets/bootstrap, docs and static infrastructure checks. Reuse TASK-15's QA-approved scaffold without depending on full TASK-15 completion.
- Rationale: backend infrastructure can proceed independently of calendar QA and frontend feature work. Existing backend E2E helper/Compose edits require **sequential merge**, not competing edits in identical files. Docker CLI currently ENOENT: static/Node checks are possible; runtime claims wait for daemon access.

### Batch 11: Real-DB E2E + operational QA
- **TASK-15** (Frontend) — execute six journeys/isolation/security against TASK-19's isolated migrated test database; coordinate TASK-19 backend runtime QA in parallel where environments do not collide.
- Rationale: earlier fixture/bundle checks are not real-DB proof. Official B3 2026 sources (January 9/Bora worker; 365-day/14-closure/247-session targeted checks) exist, but full-package QA remains separately pending. No Docker, DB or calendar blocker is implicitly cleared.

### Execution Timeline Summary

```text
Week 1:  TASK-01 → TASK-02 (BE) + TASK-06 (FE) in parallel
Week 2:  TASK-03 (BE) + TASK-06 finish → TASK-04 (BE)
Week 3:  TASK-05 (BE) → TASK-07 (FE) + TASK-08 (BE) + TASK-09 (BE) + TASK-13 (BE) in parallel
Week 4:  TASK-10 (BE, after TASK-04) + TASK-11 (FE) + TASK-12 (FE) + TASK-14 (FE) in parallel
Gap closure: TASK-16 (BE) + TASK-17 (FE) concurrently → code QA approved
Readiness: TASK-18 (FE) + independent backend auth/session verification in parallel
Docker: TASK-19 (BE) + separate TASK-10 calendar full-package QA where safe
Final: TASK-15 real-DB runs after TASK-19's isolated bootstrap → parallel QA where safe
```

## Notes

- Pagination cursor strategy (offset vs keyset) is deferred to the backend agent during TASK-05 implementation (design-04 open question).
- ADR-011 selects Docker-first main PostgreSQL and isolated E2E; ADR-008's managed deployment option remains available, with TLS/off-host backups explicitly not provided by Compose alone.
- Survey of ownership: backend owns all API/domain/import/worker/export surfaces; frontend owns all UI screens, components, state, API integration, Recharts, and E2E journeys.
- QA frontend and QA backend run in parallel after their respective tracks land (pipeline parallelization rules).
