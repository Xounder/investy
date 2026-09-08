# Task Template

## Task Information

### ID

TASK-11

### Title

Dashboard Hub — KPI Strip, Indicators, Allocation Donut, Performance Spark (M7 Frontend)

### Owner

senior-frontend

### Status

Pending

---

## Description

Implement the dashboard hub screen (`/`) — the one-glance consolidation view. Build the KPI strip (total portfolio value, cost basis, unrealized P&L, day change), benchmark indicator strip (CDI, Selic, IBOV, IFIX, SPX with staleness badges), allocation donut chart (by asset class and sector), performance spark/area chart, agenda preview (upcoming dividends), and recent transactions. Dashboard widgets deep-link into their respective module screens (Option C). All data comes from the aggregate endpoints built in TASK-05. Charts use the Recharts theme from TASK-06. Loading skeletons mirror the geometry of each widget. Empty states guide users to take their first action.

---

## Acceptance Criteria

- [ ] Dashboard page (`/`) renders with all widgets in a responsive grid
- [ ] KPI strip: 4 cards — total value, cost basis, unrealized P&L, day change; each with label, value, delta chip
- [ ] KPI strip: skeleton loading state; empty state with CTA
- [ ] Indicator strip: chips for CDI, Selic, IBOV, IFIX, SPX with latest values and staleness dot
- [ ] Indicator strip: stale data flagged with warning chip color
- [ ] Allocation donut chart: by asset class (acao/fii/etf/etc.); palette per design-05; center label = total BRL; legend as chips
- [ ] Allocation donut: empty state when no holdings
- [ ] Performance area chart: portfolio line vs CDI/IBOV/IFIX/SPX; monthly/quarterly toggle; palette per design-05
- [ ] Performance chart: empty state when no snapshots
- [ ] Agenda preview: next 5 upcoming dividends with ex-date, asset, rate; deep-link to /dividends
- [ ] Recent transactions: last 5 journal entries; deep-link to /transactions
- [ ] Quick actions: "+ Registrar" deep-links to drawer; "Import Nota" deep-links to /transactions/import/nota
- [ ] All widgets deep-link to their module screens
- [ ] Responsive: KPI grid 4→2→1 columns; charts via ResponsiveContainer
- [ ] Loading skeletons for each widget
- [ ] Empty states with journey CTAs
- [ ] All screens pass build/typecheck/lint

---

## Dependencies

### Required Tasks

- TASK-05
- TASK-06
- TASK-09

### Dependency Notes

Requires TASK-05 for aggregate API endpoints (summary, allocation, snapshots), TASK-06 for UI foundation (KPI cards, charts, layout), and TASK-09 for dividend agenda data.

---

## Technical Context

### Relevant Components

- `apps/web/src/pages/Dashboard.tsx` — dashboard page
- `apps/web/src/components/dashboard/KpiStrip.tsx` — KPI cards row
- `apps/web/src/components/dashboard/IndicatorStrip.tsx` — benchmark indicator chips
- `apps/web/src/components/dashboard/AllocationDonut.tsx` — allocation chart
- `apps/web/src/components/dashboard/PerformanceChart.tsx` — performance area chart
- `apps/web/src/components/dashboard/AgendaPreview.tsx` — upcoming dividends
- `apps/web/src/components/dashboard/RecentTransactions.tsx` — last transactions
- `apps/web/src/components/dashboard/QuickActions.tsx` — quick action buttons

### Relevant Modules

- Dashboard hub (M2)

### Relevant APIs

- `GET /portfolio/summary`
- `GET /portfolio/allocation`
- `GET /portfolio/snapshots`
- `GET /market/indicators`
- `GET /dividends/agenda`
- `GET /transactions`

### Relevant Types

- `PortfolioSummary` (totalValueCents, costBasisCents, unrealizedPnlCents, realizedPnlCents)
- `Allocation` (byClass[], bySector[])
- `Snapshot` (date, totalValueCents)
- `Indicator` (name, value, unit, fetchedAt)
- `AgendaItem` (exDate, asset, rate, status)
- `Transaction` (date, type, asset, qty, unitPriceCents)

---

## Implementation Guidance

### Expected Changes

- Implement `apps/web/src/pages/Dashboard.tsx` — responsive grid layout
- Implement `apps/web/src/components/dashboard/KpiStrip.tsx` — 4 KPI cards
- Implement `apps/web/src/components/dashboard/IndicatorStrip.tsx` — benchmark chips
- Implement `apps/web/src/components/dashboard/AllocationDonut.tsx` — Recharts donut
- Implement `apps/web/src/components/dashboard/PerformanceChart.tsx` — Recharts area
- Implement `apps/web/src/components/dashboard/AgendaPreview.tsx` — upcoming dividends
- Implement `apps/web/src/components/dashboard/RecentTransactions.tsx` — last 5 entries
- Implement `apps/web/src/components/dashboard/QuickActions.tsx` — action buttons
- Wire TanStack Query for all data fetching
- Add deep-link handlers for each widget

### Constraints

- Dashboard is the landing page; must load quickly
- KPI strip uses the KpiCard composite from TASK-06
- Charts use the Recharts theme from TASK-06
- Indicator strip uses the IndicatorChip composite from TASK-06
- All widgets deep-link into module screens (design-02)
- Responsive grid: 4 columns → 2 columns → 1 column (design-05)
- Charts via ResponsiveContainer for responsive sizing
- pt-BR labels; Intl.NumberFormat for currency

### Validation Rules

- KPI values are accurate (match summary endpoint)
- Allocation percentages sum to 100%
- Performance chart date range matches selected granularity
- All deep-links navigate to correct routes
- Loading states render for each widget independently

---

## Edge Cases

- No portfolio data — empty state with onboarding CTA
- No holdings — KPIs show zeros; allocation shows empty state
- No snapshots — performance chart shows empty state
- Stale quotes — KPIs show last known value with staleness indicator
- Very many asset classes — allocation donut groups small classes into "Outros"
- Very long transaction history — recent shows only last 5
- Indicator API failure — indicator strip shows fallback/empty
- Chart with single data point — renders point, not line
- Mobile viewport — KPI grid collapses; charts resize
- Dashboard load time — show skeletons immediately, not blank

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/web/src/components/charts/theme.ts` — also TASK-06 (creates), TASK-12 (extends). **Merge strategy: parallel with careful merge** — this task consumes the theme; if it needs additions, add new chart-palette constants only, never edit shared axis/tooltip helpers.
- `apps/web/src/lib/api.ts` — also TASK-06 (creates), TASK-07, TASK-09, TASK-12, TASK-14 (add methods). **Merge strategy: parallel with careful merge** — this task adds summary/allocation/snapshots/indicators methods only; never modify shared helpers.

---

## Testing

### Unit Tests

- [ ] KpiStrip renders 4 cards with correct values
- [ ] IndicatorStrip renders chips with staleness dots
- [ ] AllocationDonut renders with correct data
- [ ] PerformanceChart renders with portfolio line
- [ ] AgendaPreview renders next 5 dividends
- [ ] RecentTransactions renders last 5 entries
- [ ] QuickActions renders deep-link buttons

### Integration Tests

- [ ] Dashboard loads and fetches all aggregate data
- [ ] KPI values match summary endpoint
- [ ] Allocation chart matches allocation endpoint
- [ ] Deep-links navigate to correct module screens

### Manual Validation

- [ ] `pnpm dev` in `apps/web` — dashboard renders with all widgets
- [ ] Responsive: dashboard looks correct on mobile
- [ ] Deep-links: clicking widget navigates to module
- [ ] Empty states: dashboard with no data shows CTAs

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

- ADR-009: Design system + Recharts
- design-02: Dashboard screen map, deep-link widgets
- design-05: KPI card, indicator strip, charts, states
- design-07: M7 Dashboard + snapshots milestone (UI portion)
