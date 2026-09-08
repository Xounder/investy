# Task Template

## Task Information

### ID

TASK-05

### Title

REST API Endpoints — Journals, Holdings, Portfolios, Accounts (M4 API)

### Owner

senior-backend

### Status

Pending

---

## Description

Implement the resource-oriented REST API endpoints for the core CRUD operations: transactions (journal), holdings, portfolios, brokers, and accounts. These endpoints consume the domain engine from `packages/domain` and the database schema from TASK-03. Implement the journal write path: `POST /transactions` appends journal events and triggers holding recompute atomically. Implement the holdings read path with live BRL valuation (FX-aware). Implement portfolio and account CRUD with ownership scoping. Implement the summary, allocation, and snapshots aggregate endpoints for dashboard consumption. All endpoints use zod validation, ownership-scoped repositories, and return integer cents with currency hints.

---

## Acceptance Criteria

- [ ] `GET /transactions` — filtered list (portfolioId, accountId, assetId, type, from, to, page); ownership-scoped
- [ ] `POST /transactions` — creates journal event; triggers holding recompute atomically; returns 201
- [ ] `PATCH /transactions/:id` — updates journal event (limited fields); recomputes holding
- [ ] `DELETE /transactions/:id` — removes journal event; recomputes holding
- [ ] `GET /holdings?portfolioId=&accountId=` — materialized holdings with live BRL valuation
- [ ] `GET /holdings/:assetId` — position detail with lots, quote, events
- [ ] `GET /portfolios` — user's portfolios list
- [ ] `POST /portfolios` — create portfolio
- [ ] `GET /portfolios/:id` — portfolio detail with summary
- [ ] `PATCH /portfolios/:id` — update portfolio
- [ ] `DELETE /portfolios/:id` — delete (protected if has holdings)
- [ ] `GET /brokers` — seeded broker catalog
- [ ] `POST /brokers` — custom broker
- [ ] `GET /accounts?portfolioId=` — user accounts
- [ ] `POST /accounts`, `PATCH /accounts/:id`, `DELETE /accounts/:id` — CRUD
- [ ] `GET /portfolio/summary?portfolioId=` — totals, cost, unrealized, realized, allocation (BRL)
- [ ] `GET /portfolio/allocation?portfolioId=` — byClass / bySector percentages
- [ ] `GET /portfolio/snapshots?portfolioId=&range=` — daily snapshots
- [ ] All endpoints validate input with zod
- [ ] All user-owned queries scope by session userId
- [ ] All tests pass; build/typecheck/lint clean

---

## Dependencies

### Required Tasks

- TASK-02
- TASK-03
- TASK-04

### Dependency Notes

Requires TASK-02 for the domain engine (journal event processing, holding recompute), TASK-03 for database schema and auth middleware, and TASK-04 for quote data (used in holdings valuation and summary).

---

## Technical Context

### Relevant Components

- `apps/api/src/routes/transactions.ts`
- `apps/api/src/routes/holdings.ts`
- `apps/api/src/routes/portfolios.ts`
- `apps/api/src/routes/brokers.ts`
- `apps/api/src/routes/accounts.ts`
- `apps/api/src/routes/portfolio-aggregates.ts` — summary, allocation, snapshots
- `apps/api/src/repositories/` — scoped repository implementations
- `apps/api/src/services/journal.ts` — journal write service (calls domain engine)

### Relevant Modules

- Transactions / Journal module (M4)
- Portfolio / Holdings module (M3)
- Dashboard hub (M2 — aggregates)

### Relevant APIs

- `GET/POST/PATCH/DELETE /transactions`
- `GET/POST/PATCH/DELETE /holdings` (read-only)
- `GET/POST/PATCH/DELETE /portfolios`
- `GET /brokers`, `POST /brokers`
- `GET/POST/PATCH/DELETE /accounts`
- `GET /portfolio/summary`
- `GET /portfolio/allocation`
- `GET /portfolio/snapshots`

### Relevant Types

- Transaction CRUD types (from design-04)
- Holding with valuation (from design-03)
- Portfolio with summary
- Account CRUD types
- Summary, Allocation, Snapshot aggregates

---

## Implementation Guidance

### Expected Changes

- Implement `apps/api/src/routes/transactions.ts` — CRUD + journal event processing
- Implement `apps/api/src/routes/holdings.ts` — materialized holdings read with valuation
- Implement `apps/api/src/routes/portfolios.ts` — portfolio CRUD
- Implement `apps/api/src/routes/brokers.ts` — broker catalog + custom
- Implement `apps/api/src/routes/accounts.ts` — account CRUD
- Implement `apps/api/src/routes/portfolio-aggregates.ts` — summary, allocation, snapshots
- Implement `apps/api/src/services/journal.ts` — orchestrates journal write + holding recompute
- Implement scoped repositories for each entity
- Wire all routes into the Hono app

### Constraints

- Journal write must be atomic: journal event + holding recompute in one DB transaction (ADR-005)
- Holdings are materialized (derived from journal), not independently editable
- Summary/allocation endpoints compute on read (not stored state) except snapshots
- All amounts integer cents; currency hint in response
- Ownership scoping on every query (ADR-006)
- zod validation on all inputs (ADR-010)
- Cross-user access returns 404 (design-04)
- Snapshots retained indefinitely (no pruning) (design-06)

### Validation Rules

- Transaction type must be one of: buy, sell, split, bonificação, jcp, amortização, adjustment, opening
- Portfolio delete blocked if has holdings or transactions
- Account delete blocked if has transactions
- Page parameter must be positive integer
- Date range filters must be valid ISO-8601

---

## Edge Cases

- Journal write triggers holding recompute — if recompute fails, entire transaction rolls back
- Delete last transaction for an asset — holding should be deleted (qty = 0)
- Summary with no transactions — returns zeros, not null
- Allocation with no holdings — returns empty allocation
- Snapshots for date range with no data — returns empty array
- Concurrent journal writes for same account+asset — serialized by DB transaction
- Portfolio has accounts with transactions — delete must be blocked with clear error
- Page beyond available results — returns empty array, not 404
- Invalid asset symbol in transaction — returns 400 with clear error
- Holding valuation with stale quote — returns last known quote value

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/api/src/db/schema.ts` — also TASK-03 (creates schema), TASK-04 (adds quote/catalog tables), TASK-10 (worker reads). **Merge strategy: sequential** — this task consumes existing tables; do not modify schema definitions added by TASK-03/TASK-04 unless strictly required for an endpoint; if required, add a note in the PR.
- `apps/api/src/index.ts` — also TASK-03, TASK-04, TASK-13 (each registers its own route module). **Merge strategy: sequential preferred**; if parallelized, merge at the route-registration block only (app.route per resource).
- `apps/api/src/middleware/auth.ts` — also TASK-03 (creates), TASK-13 (consumes). **Merge strategy: parallel with careful merge** — this task imports only; never modify middleware internals.
- `apps/api/src/repositories/` — also TASK-03 (base layer), TASK-13 (export/erasure repos). **Merge strategy: parallel with careful merge** — add new repository files per entity; never modify the base class created by TASK-03.

---

## Testing

### Unit Tests

- [ ] Journal write service: creates event + recomputes holding atomically
- [ ] Holding recompute: buy → correct qty/avg/cost
- [ ] Holding recompute: sell → realized P&L
- [ ] Summary: totals, cost, unrealized, realized
- [ ] Allocation: byClass, bySector percentages

### Integration Tests

- [ ] Full journal write flow: POST transaction → GET holdings → verify
- [ ] Portfolio CRUD: create → list → detail → update → delete
- [ ] Account CRUD with ownership scoping
- [ ] Cross-user isolation: user A cannot see user B's transactions
- [ ] Summary endpoint returns correct aggregates
- [ ] Allocation endpoint returns correct percentages

### Manual Validation

- [ ] `pnpm build` in `apps/api` passes
- [ ] `pnpm test` in `apps/api` passes
- [ ] Manual test: create portfolio → add transaction → check holdings
- [ ] Manual test: summary endpoint returns correct data

---

## Definition of Done

- [ ] Implementation completed
- [ ] Acceptance criteria satisfied
- [ ] Tests created or updated
- [ ] Build passes
- [ ] Lint passes
- [ ] Validation completed

---

## References

- ADR-005: Transaction journal
- design-03: Entities, derivation rules
- design-04: REST API endpoint table
- design-07: M4 Journal UI + holdings (API portion)
