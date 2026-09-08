# Investy — Task Index

Pipeline: `investy-dashboard` · Step: tech-lead · Status: created

## Overview

15 implementation tasks decomposed from the approved design docs (design-01..07) and architecture (ADR-001..010). The task graph maximizes backend/frontend parallelism after the foundation milestone (TASK-01). Total estimated effort: ≈40 dev-days (from design-07). Each task has exactly one owner; backend/export API and frontend/UI screens are cleanly separated per ownership rules.

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
| TASK-15 | E2E Testing, Isolation, Security, Deploy Config (M9) | senior-frontend | 3–4d | TASK-07..12, TASK-14 |

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

TASK-15 (E2E + Hardening) ◄── TASK-07..12, TASK-14
```

## Ownership Mapping

| Owner | Tasks | Total Est. |
|-------|-------|------------|
| senior-backend | TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-08, TASK-09, TASK-10, TASK-13 | ≈30–31d |
| senior-frontend | TASK-06, TASK-07, TASK-11, TASK-12, TASK-14, TASK-15 | ≈20–21d |

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

### Batch 8: E2E + Hardening (single task)
- **TASK-15** (Frontend) — E2E, isolation, security, deploy
- Rationale: must run after all features land. Sequential.

### Execution Timeline Summary

```text
Week 1:  TASK-01 → TASK-02 (BE) + TASK-06 (FE) in parallel
Week 2:  TASK-03 (BE) + TASK-06 finish → TASK-04 (BE)
Week 3:  TASK-05 (BE) → TASK-07 (FE) + TASK-08 (BE) + TASK-09 (BE) + TASK-13 (BE) in parallel
Week 4:  TASK-10 (BE, after TASK-04) + TASK-11 (FE) + TASK-12 (FE) + TASK-14 (FE) in parallel
Week 5:  TASK-15 (FE) → QA frontend + QA backend in parallel
```

## Notes

- Pagination cursor strategy (offset vs keyset) is deferred to the backend agent during TASK-05 implementation (design-04 open question).
- Managed Postgres provider and API host are deferred to implementation (architecture.md open questions).
- Survey of ownership: backend owns all API/domain/import/worker/export surfaces; frontend owns all UI screens, components, state, API integration, Recharts, and E2E journeys.
- QA frontend and QA backend run in parallel after their respective tracks land (pipeline parallelization rules).