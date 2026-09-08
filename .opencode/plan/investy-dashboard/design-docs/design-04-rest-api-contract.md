# Design 04 — REST API Contract

## Context

### Problem Statement

Investy's `apps/api` (Node + Hono, ADR-001/002) must expose the V1 domain through a consistent, ownership-scoped, validated REST surface consumed by the SPA and the worker. Endpoints must enable the six journal-driven journeys, conservative market-data access via the proxy (ADR-003), and import/export (ADR-005/007).

### Goals

- Define the resource-oriented endpoint set for all nine modules.
- Enforce per-user ownership scoping, zod validation, and rate limiting on every route (ADR-006/010).
- Separate nota import into preview → confirm (journal immutable until approved, ADR-005).
- Give backend agents a stable contract and frontend agents the exact data shapes they consume.

### Constraints

- Hono + zod + Drizzle; JSON over HTTPS; httpOnly cookie sessions (ADR-006/010).
- CORS locked to app origin; credentials include.
- All user-owned queries scope by authenticated user id at repository layer.
- Worker shares schema/repositories; endpoints are plain data access (no secrets in responses).

---

## Options Considered

### Option A — Coarse-grained endpoints (e.g., `/portfolio` mega-response)

#### Description

One aggregate endpoint returns holdings + snapshots + quotes in a single payload.

#### Advantages

- Fewer round trips; simple client cache.

#### Disadvantages

- Rigid composition; over-fetching on detail views; harder per-module caching and invalidation.

#### Effort Estimate

Small — rejected for cache granularity needs.

### Option B — Resource-oriented REST with focused aggregation endpoints

#### Description

CRUD per resource plus dedicated aggregate/read-model endpoints (summary, allocation, snapshots, agenda). Client composes via TanStack Query keys.

#### Advantages

- Fine-grained invalidation on journal writes; per-module cache TTL; scales to new screens.

#### Disadvantages

- More endpoints to validate/test.

#### Effort Estimate

Medium — selected.

### Custom Option (Selected) — Resource-oriented REST per the approved presentation

#### Description

The endpoint table below, matching presentation §3 and the confirmed scope (FX read-time conversion returns BRL values; nota preview/confirm split).

#### Notes

- All responses money as integer cents with a `currency` hint; display formatting stays client-side.

---

## Decision

### Selected Option

Custom Option B (resource-oriented REST, focused aggregation endpoints) as presented and approved.

### Reasoning

- Aligns with TanStack Query cache model and stateless SPA (ADR-006).
- Preview/confirm split protects journal immutability (ADR-005).
- Read-time FX conversion keeps the API opinionated (BRL canonical for display) without persisting derived totals.

### Trade-offs Accepted

- Quote batch endpoint does provider hydration lazily under TTL.
- Aggregates (summary/allocation/snapshots) are recomputed read-model queries, not stored state except snapshots.

---

## Endpoint Table (v1)

All paths under `/api/v1`. Bearer of session cookie. Errors: `{ error: { code, message, fields? } }`.

### Auth & Onboarding (M1)

```
POST /auth/register                 { email, password, name? } → 201 { user }
POST /auth/login                    { email, password } → 200 { user }   (set-cookie session)
POST /auth/logout                   → 204
GET  /auth/me                       → 200 { user }
POST /auth/password-reset/request   { email } → 202
POST /auth/password-reset/confirm   { token, password } → 204
POST /onboarding                    { portfolioName?, broker?, firstEntry? } → 201 { portfolio, holding? }
```

### Portfolios, Brokers, Accounts (M3/M9)

```
GET    /portfolios                  → list (multi-portfolio)
POST   /portfolios                  → 201
GET    /portfolios/:id              → detail (+ summary)
PATCH  /portfolios/:id
DELETE /portfolios/:id              → scope-protected (no orphan assets)
GET    /brokers                     → seeded catalog
POST   /brokers                     → custom broker
GET    /accounts?portfolioId=       → user accounts
POST   /accounts
PATCH  /accounts/:id
DELETE /accounts/:id
```

### Assets Catalog (M3/M7)

```
GET   /assets?search=&class=&currency=&page=   → paged catalog
GET   /assets/trending                          → "mais buscados"
GET   /assets/:symbol                           → catalog entity + last quote + overrides
PATCH /assets/:symbol/override   { priceCents } → create/update user override (ADR-003)
DELETE /assets/:symbol/override                 → clear override
```

### Transactions / Journal (M4)

```
GET    /transactions?portfolioId=&accountId=&assetId=&type=&from=&to=&page=
POST   /transactions        { type, date, accountId, assetId, qty, unitPriceCents, feeCents, notes }
PATCH  /transactions/:id
DELETE /transactions/:id
POST   /transactions/import/csv   (multipart template CSV) → 201 { created: n, errors: [] }
```

### Nota de Corretagem (M5)

```
POST /transactions/import/nota/preview  (multipart: PDF | text | CSV | XML, brokerId?)
   → 200 { nota: { brokerId, notaNumber, tradeDate, items[], fees{...}, rateio[], warnings[], importToken }
POST /transactions/import/nota/confirm  { importToken } → 201 { created: n, holdings }, 409 { reconciliationIssues[] }
GET  /transactions/import/nota/history  → prior imports (dedupe reference)
```

Preview is stateless-safe (payload echoed back in `importToken` — persisted temp row with TTL); confirm appends journal rows atomically in one transaction (journal write + holding recompute).

### Holdings (M3)

```
GET /holdings?portfolioId=&accountId=     → materialized rows + live valuation (BRL)
GET /holdings/:assetId                    → position detail + lots + quote + events
```

### Dividends (M6)

```
GET  /dividends/agenda?from=&to=          → expected/confirmed/paid items (+ projections)
GET  /dividends/history?month=&year=      → income by month/asset
POST /dividends           { assetId, kind, exDate, paymentDate?, rateCentsPerUnit }
PATCH /dividends/:id      { status | paymentDate }   → user confirmation of credit date
```

### Dashboard / Reports (M2/M8)

```
GET /portfolio/summary?portfolioId=           → totals, cost, unrealized, realized, allocation (BRL)
GET /portfolio/allocation?portfolioId=        → byClass / bySector (display percentages)
GET /portfolio/snapshots?portfolioId=&range=  → daily snapshots (all retained, no pruning)
GET /reports/performance?portfolioId=&granularity=month|quarter
GET /reports/income?portfolioId=&from=&to=
```

### Market Data via Proxy (M2/M7)

```
GET /market/quotes?symbols=A,B,C        → { quotes[], stale[], overrides[] }   (TTL-cached, lazy hydration)
GET /market/benchmarks?series=CDI,IBOV  → benchmark series
GET /market/indicators                  → Selic/CDI/IPCA latest, fetch time
```

### Data Ownership (M9)

```
POST /export?format=json|csv            → streamed export of user data
GET  /settings/backups                  → last backup, status, retention note
GET  /settings/overrides                → list of user overrides
DELETE /settings/account                → full account erasure (ownership)
```

## Cross-Cutting Behavior

- **Ownership**: every read/write filters by session user; cross-user access returns 404 (not 403) to avoid enumeration.
- **Validation**: zod schemas per route; 400 with field errors.
- **Rate limiting**: per-user throttling + login brute-force protection + provider-quota budgeting (ADR-010).
- **Money**: all amounts integer cents; timestamps ISO-8601 UTC; `America/Sao_Paulo` applied client-side and in worker job boundaries.
- **Cache**: TanStack Query keys mirror these resources for invalidation on post-success.

---

## Impact

### Documentation Affected

- `design-03-domain-data-model.md` (entities/fields behind these endpoints)
- `design-02-information-architecture-ux.md` (journeys consuming the contract)

### Architecture Affected

- ADR-006 (scoping), ADR-010 (validation/rate limits), ADR-002 (module organizers in Hono).

### Dependencies Added

- Hono routers per resource, zod schemas, multipart handling for uploads.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Nota confirm race (two tabs) | Low | Medium | Optimistic locking via `importToken`; single transaction |
| Aggregates recompute heavy per request at scale | Low (personal scale) | Low | Snapshot read-model for history; in-memory cache for summary |
| Multipart size abuse | Low | High | Upload size + file type limits; parse to temp row with TTL |

---

## Open Questions

- None for V1. Pagination cursor strategy (offset vs keyset) finalized by backend agent during implementation.