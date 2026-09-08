# Design 07 — Effort and Build Sequence Estimate

## Context

### Problem Statement

V1 scope (design-01) is a full multi-user journal-first product. The team needs a realistic effort estimate and a dependency-correct build sequence so backend/frontend work can parallelize safely (per pipeline parallelization rules) and the highest-risk domain code is de-risked first.

### Goals

- Provide per-module effort estimates (relative dev-days, single full-stack senior baseline).
- Define a build sequence with dependency-safe parallelization.
- Align total with ADR-001's 4–6 week MVP estimate.

### Constraints

- ADR-001 estimate: 4–6 weeks MVP. ADR-002: domain package shared and dependency-free.
- Pipeline: Solution Designer → Tech Lead → parallel Frontend/Backend → QA (Planning Analyst skipped — greenfield).
- Validation gates: domain unit tests, API tests, Playwright E2E; builds via run-package-command.

---

## Options Considered

### Option A — Build everything in parallel from the start

#### Description

Frontend and backend start simultaneously against an in-flight schema.

#### Advantages

- Shortest wall-clock in theory.

#### Disadvantages

- Contract drift; rework; no foundation to test the riskiest math.

#### Effort Estimate

Variable — rejected; violates dependency safety.

### Option B — Thin vertical slice first, then breadth

#### Description

Build one end-to-end slice (auth + one holding + quote) first, then expand modules.

#### Advantages

- Early integration proof; contract validated early.

#### Disadvantages

- Adds a stabilization detour.

#### Effort Estimate

Medium — folded into the sequence below as the first milestone.

### Custom Option (Selected) — Foundation first, then dependency-ordered module milestones

#### Description

Sequence below: domain engine + auth/wiring first, market/proxy next, then breadth through modules, dashboard/reports last. Parallel tracks unlock after each milestone's contract is fixed.

#### Notes

- Estimations are relative dev-days for one experienced full-stack developer; parallelization compresses calendar time, not person-days.

---

## Decision

### Selected Option

Custom Option B (foundation first, dependency-ordered modules) as presented and approved.

### Reasoning

- The journal engine is the highest-risk, most-tested code (ADR-005) — it must land first and alone.
- Auth + session/ownership underpins every scoped query (ADR-006) — second.
- Market proxy (ADR-003) enables valuation of everything else — third.
- Modules then build breadth-first; dashboard/reports consolidate last.

### Trade-offs Accepted

- Nothing visible to the user until milestone M0 completes; mitigated by milestone-sized releases.

---

## Build Sequence

| # | Milestone | Modules | Detail | Effort |
|---|---|---|---|---|
| M0 | Foundation | — | Monorepo setup, Tailwind v4 theme (docu-forge tokens), domain skeleton, CI wiring, test harness | 3 d |
| M1 | Domain engine | — | JournalEngine (buy/sell/split/bonificação/jcp/amortização/adjustment/opening), avg-price, realized P&L, rateio de custos, money+fx helpers. **Property-tested first** | 4 d |
| M2 | Auth + ownership | M1 | Argon2id, sessions (httpOnly cookie), scoped repository layer, rate limiting foundation, onboarding API | 3 d |
| M3 | Market proxy + catalog | M3/M7 | QuoteProvider interface (brapi/BCB/Yahoo/CoinGecko), quote cache TTL, overrides, FX quote rows, asset catalog seed + search + trending | 4 d |
| M4 | Journal UI + holdings | M3/M4 | Register drawer, journal screen, holdings table + asset drawer, portfolio selector | 4 d |
| M5 | CSV + nota import | M4/M5 | CSV template/import; nota parser (PDF/text/CSV/XML), rateio display, preview→confirm, reconciliation | 4–5 d |
| M6 | Dividends | M6 | Provider dividend sync, agenda, status workflow, FII cadence projection, income history | 3 d |
| M7 | Dashboard + snapshots | M2/M8 | KPI strip, indicator strip, allocation donut, performance area, snapshots/benchmarks endpoints, worker quote+snapshot+agenda jobs | 4 d |
| M8 | Reports + export + settings | M8/M9 | Performance vs benchmarks screen, income bars, export JSON/CSV, settings CRUD, backup job + restore verification | 3 d |
| M9 | E2E + hardening | all | Playwright journeys, isolation tests, security pass (secret scan, CORS, rate limits), accessibility pass, deploy config | 3–4 d |
| **Total** | | | | **≈ 40 d** |

## Parallelization

- After M1: domain tests (M1) run in parallel with M0 tooling hardening.
- After M3: backend (M4..M6 API) and frontend (M4..M6 UI) tracks parallelize against the frozen contract (design-04).
- M7 worker jobs parallel with frontend dashboard; M8 export parallel with UI settings.
- QA frontend and QA backend run in parallel after their tracks land (pipeline parallelization rules).
- Workers (fees/rateio, FX, parse) are covered by Vitest; journeys by Playwright; cross-user isolation by dedicated API tests.

## Effort Rationale

- Sizing assumes one experienced full-stack dev; person-days map to the 4–6 week MVP (ADR-001).
- M1 and M5 carry the most estimation risk (domain math + parser) — budgeted with tests in-line.
- Recharts/Tailwind costs are concentrated in M0/M7; no chart-library contingency beyond custom tooltips (design-05).

---

## Impact

### Documentation Affected

- `design-01-product-scope.md` (module boundaries this sequence implements).

### Architecture Affected

- None new; sequence honors ADR-001..010 dependency order.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Parser (M5) exceeds estimate | Medium | High | Parser milestone isolated; preview flow shields correctness; per-broker hints iterative |
| Contract drift between parallel tracks | Medium | Medium | design-04 frozen before M4 splits; QA regenerates fixtures from schema |
| Snapshot job backfills large history | Medium | Low | Backfill triggered on account activation, capped per run, resumable (ADR-007) |

---

## Open Questions

- Hosting provider trio (Neon vs Supabase vs Railway; Railway vs Fly vs Render) — finalized at implementation per architecture.md open questions; no effect on design.