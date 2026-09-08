# Task Template

## Task Information

### ID

TASK-07

### Title

Register Drawer, Journal Screen, and Holdings Table (M4 Frontend)

### Owner

senior-frontend

### Status

Pending

---

## Description

Implement the core data-entry and viewing surfaces: the global "+ Registrar" drawer (used from anywhere in the app), the journal/transactions screen with filters, and the holdings table with portfolio selector and asset detail drawer. The register drawer is the single mutation entry point (Option C amplifier) that writes journal events (buy/sell/dividend/jcp/amortization/split/adjustment). It supports autocomplete from the asset catalog, pre-fills from holdings context (e.g., sell pre-fills from position), and handles validation errors from the API. The journal screen shows the full transaction history with filters. The holdings table displays materialized positions with live BRL valuation, P&L coloring, and inline row actions. The portfolio selector enables multi-portfolio switching.

---

## Acceptance Criteria

- [ ] "+ Registrar" drawer: opens from top bar or any deep-link; form with type selector (buy/sell/dividend/jcp/amortization/split/adjustment), asset autocomplete, qty, unit price, fees, account, date, notes
- [ ] Register drawer: sell type pre-fills from holdings position when opened from holdings row action
- [ ] Register drawer: validates inputs client-side (zod-like); submits to `POST /transactions`; shows success/error feedback
- [ ] Register drawer: route-backed (deep-linkable via `/global-action`); dismissable; browser back closes drawer
- [ ] Journal screen (`/transactions`): table with columns (date, type, asset, qty, unit price, fees, total, notes); filters (portfolio, account, asset, type, date range); pagination
- [ ] Journal screen: empty state with CTA to register first transaction
- [ ] Holdings table (`/holdings`): columns (asset, class, qty, avg price, cost basis, market value, day Δ, unrealized P&L, %); sticky first column on mobile
- [ ] Holdings table: inline row actions (sell, view dividend) that pre-fill the register drawer
- [ ] Holdings table: P&L coloring (green positive, red negative) with sign symbol (not color alone)
- [ ] Portfolio selector: dropdown in top bar; switches active portfolio; persists selection
- [ ] Asset detail drawer (`/assets/:symbol`): shows lots, current quote, events history; deep-linkable
- [ ] All screens use TanStack Query for data fetching; cache invalidation on journal write
- [ ] Loading skeletons for all tables
- [ ] Empty states with journey CTAs
- [ ] All screens pass build/typecheck/lint

---

## Dependencies

### Required Tasks

- TASK-05
- TASK-06

### Dependency Notes

Requires TASK-05 for the backend API endpoints (transactions, holdings, portfolios, accounts) and TASK-06 for the UI foundation (layout, design system components, routing, API client, stores).

---

## Technical Context

### Relevant Components

- `apps/web/src/components/drawers/RegisterDrawer.tsx` — global register drawer
- `apps/web/src/components/tables/HoldingsTable.tsx` — holdings table
- `apps/web/src/components/tables/JournalTable.tsx` — journal/transactions table
- `apps/web/src/components/drawers/AssetDrawer.tsx` — asset detail drawer
- `apps/web/src/components/selectors/PortfolioSelector.tsx` — portfolio selector
- `apps/web/src/pages/Holdings.tsx` — holdings page
- `apps/web/src/pages/Transactions.tsx` — journal page
- `apps/web/src/stores/ui.ts` — Zustand store (drawer state, active portfolio)

### Relevant Modules

- Transactions / Journal module (M4)
- Portfolio / Holdings module (M3)
- Assets Catalog (M7 — asset detail)

### Relevant APIs

- `GET/POST/PATCH/DELETE /transactions`
- `GET /holdings`
- `GET /holdings/:assetId`
- `GET/POST/PATCH/DELETE /portfolios`
- `GET /assets/:symbol`
- `GET /assets?search=` (autocomplete)

### Relevant Types

- Transaction form data (type, date, accountId, assetId, qty, unitPriceCents, feeCents, notes)
- Holding with valuation (asset, qty, avgPrice, costBasis, marketValue, unrealizedPnl)
- Portfolio (id, name, isDefault)
- Asset (symbol, name, class, sector, currency)

---

## Implementation Guidance

### Expected Changes

- Implement `RegisterDrawer.tsx` — form, validation, API submission, pre-fill logic
- Implement `JournalTable.tsx` — columns, filters, pagination, empty/loading states
- Implement `HoldingsTable.tsx` — columns, P&L coloring, inline actions, sticky column
- Implement `AssetDrawer.tsx` — lots, quote, events, deep-linkable
- Implement `PortfolioSelector.tsx` — dropdown, active portfolio state
- Implement `Holdings.tsx` page — portfolio selector + holdings table
- Implement `Transactions.tsx` page — journal table with filters
- Wire register drawer route (`/global-action`)
- Add Zustand store for drawer state and active portfolio
- Wire TanStack Query mutations for transaction writes
- Add cache invalidation: transaction write invalidates holdings, summary, journal queries

### Constraints

- Single mutation entry point (the register drawer) reused across contexts (design-02)
- Route-backed drawers: deep-linkable, dismissable, back-safe (design-02)
- Inline row actions pre-fill the drawer from position context (design-02)
- Tabular numerals for all money display (design-05)
- pt-BR labels throughout
- Responsive: tables horizontal scroll + sticky first column (design-05)
- Sell from holdings pre-fills: asset, qty (max available), price (last quote)
- Cache invalidation: write to transactions → invalidate holdings, summary, journal queries

### Validation Rules

- Transaction form validates required fields (type, date, accountId, assetId, qty, unitPriceCents)
- Qty must be positive
- Unit price must be positive
- Date must be valid ISO-8601
- Account must exist and belong to user
- Asset must exist in catalog

---

## Edge Cases

- Register drawer opened without login — redirect to /login first
- Submit transaction while offline — show error, not crash
- Portfolio selector with no portfolios — show "create first portfolio" CTA
- Holdings table with no holdings — empty state with CTA to register
- Journal table with no transactions — empty state with CTA
- Asset not found in catalog — show "asset not found" in drawer
- Pre-fill sell with stale quote — show quote with staleness warning
- Multiple portfolios — switching portfolio re-fetches holdings
- Very long journal history — pagination with cursor or offset
- Drawer open + navigate away — drawer closes automatically
- Concurrent drawer submissions — disable submit button during mutation
- Asset detail for asset with no lots — show "no position" state
- Holdings P&L with zero cost basis — display as 0%, not NaN

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/web/src/stores/ui.ts` — also TASK-06 (creates store). **Merge strategy: sequential** — TASK-06 created the store; this task APPENDS drawer/portfolio slices only. Never edit existing slices.
- `apps/web/src/lib/api.ts` — also TASK-06 (creates), TASK-09, TASK-11, TASK-12, TASK-14 (add methods). **Merge strategy: parallel with careful merge** — this task adds transaction/holding/portfolio methods only; never modify shared fetch/error helpers.
- `apps/web/src/app.tsx` — also TASK-06 (creates root). **Merge strategy: sequential** — TASK-06 created the root; this task edits only the route table to add `/global-action` and drawer routes.

---

## Testing

### Unit Tests

- [ ] RegisterDrawer renders all form fields
- [ ] RegisterDrawer validates required fields
- [ ] RegisterDrawer pre-fills from holdings context
- [ ] HoldingsTable renders rows with P&L coloring
- [ ] JournalTable renders rows with type badges
- [ ] PortfolioSelector renders portfolio list
- [ ] AssetDrawer renders lots and quote

### Integration Tests

- [ ] Register drawer submit → transaction created → holdings updated
- [ ] Holdings row action → register drawer pre-filled
- [ ] Portfolio switch → holdings re-fetched
- [ ] Asset detail deep-link → drawer opens with correct data
- [ ] Cache invalidation: transaction write invalidates holdings query

### Manual Validation

- [ ] `pnpm dev` in `apps/web` — register drawer opens from top bar
- [ ] Submit buy transaction → holdings table updates
- [ ] Submit sell from holdings row action → drawer pre-filled
- [ ] Switch portfolio → holdings change
- [ ] Responsive: tables scroll on mobile viewport

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

- design-02: Screen map, Option C amplifiers, key journeys
- design-05: Component grammar, table composites, states
- design-04: Transaction and holdings endpoints
- design-07: M4 Journal UI + holdings milestone (UI portion)
