# Task Template

## Task Information

### ID

TASK-12

### Title

Reports & Analytics Screen (M8 Frontend)

### Owner

senior-frontend

### Status

Pending

---

## Description

Implement the reports and analytics screen (`/reports`) that provides performance analysis vs benchmarks, realized P&L history, and dividend income visualization. Build the performance comparison chart (portfolio vs CDI/IBOV/IFIX/S&P 500) with monthly/quarterly granularity toggle. Build the realized P&L history view showing gains/losses over time. Build the dividend income bar chart (monthly income by asset class). All charts use the Recharts theme from TASK-06. Data comes from the reports API endpoints built in TASK-05. The screen follows the DocuForge dashboard language with data-dense tables and charts.

---

## Acceptance Criteria

- [ ] Reports page (`/reports`) renders with performance, P&L, and income sections
- [ ] Performance comparison chart: portfolio line vs CDI/IBOV/IFIX/S&P 500; monthly/quarterly toggle
- [ ] Performance chart: Recharts area with palette per design-05; tooltips in pt-BR currency format
- [ ] Performance chart: empty state when no snapshots
- [ ] Realized P&L history: table or bar chart showing realized gains/losses per period
- [ ] Realized P&L: empty state when no realized events
- [ ] Dividend income bar chart: monthly bars by asset class; palette per design-05
- [ ] Income chart: empty state when no dividends
- [ ] Granularity toggle: monthly ↔ quarterly switches chart data
- [ ] All charts responsive via ResponsiveContainer
- [ ] Loading skeletons for each section
- [ ] pt-BR labels; Intl.NumberFormat for all currency values
- [ ] Tabular numerals for money display
- [ ] All screens pass build/typecheck/lint

---

## Dependencies

### Required Tasks

- TASK-05
- TASK-06
- TASK-09
- TASK-10

### Dependency Notes

Requires TASK-05 for reports API endpoints (performance, income), TASK-06 for UI foundation (charts, layout), TASK-09 for dividend data, and TASK-10 for snapshot data (performance chart depends on daily snapshots).

---

## Technical Context

### Relevant Components

- `apps/web/src/pages/Reports.tsx` — reports page
- `apps/web/src/components/reports/PerformanceComparison.tsx` — performance vs benchmarks
- `apps/web/src/components/reports/RealizedPnl.tsx` — realized P&L history
- `apps/web/src/components/reports/IncomeBars.tsx` — dividend income chart
- `apps/web/src/components/reports/GranularityToggle.tsx` — monthly/quarterly switch

### Relevant Modules

- Reports / Analytics (M8)

### Relevant APIs

- `GET /reports/performance?portfolioId=&granularity=month|quarter`
- `GET /reports/income?portfolioId=&from=&to=`
- `GET /portfolio/snapshots` (for performance chart data)

### Relevant Types

- `PerformanceData` (date, portfolioValue, cdi, ibov, ifix, spx)
- `RealizedPnlData` (period, realizedCents)
- `IncomeData` (month, year, totalCents, byClass[])
- `Granularity` (month | quarter)

---

## Implementation Guidance

### Expected Changes

- Implement `apps/web/src/pages/Reports.tsx` — page layout with sections
- Implement `apps/web/src/components/reports/PerformanceComparison.tsx` — Recharts area chart
- Implement `apps/web/src/components/reports/RealizedPnl.tsx` — realized P&L visualization
- Implement `apps/web/src/components/reports/IncomeBars.tsx` — Recharts bar chart
- Implement `apps/web/src/components/reports/GranularityToggle.tsx` — toggle component
- Wire TanStack Query for data fetching
- Add granularity state management

### Constraints

- Charts use Recharts theme from TASK-06
- Performance chart palette: portfolio #2563EB, CDI #6B7280, IBOV #7C3AED, IFIX #16A34A, SPX #CA8A04 (design-05)
- Income bars: month bars #7C3AED (design-05)
- All currency values use pt-BR Intl formatting
- Tabular numerals for money display
- Responsive: charts reflow via ResponsiveContainer
- Empty states render the empty state component, not bare charts
- pt-BR labels throughout

### Validation Rules

- Performance percentages are accurate (match API response)
- Income totals sum correctly
- Granularity toggle switches data correctly
- All charts render with correct data

---

## Edge Cases

- No snapshots for selected period — performance chart shows empty state
- No realized P&L events — shows empty state
- No dividend income — income chart shows empty state
- Single data point — renders point, not line
- Very many benchmark lines — legend remains readable
- Granularity switch while loading — show loading state
- Very large income data — aggregate by class if too many items
- Performance with negative returns — line goes below zero, correct coloring
- Currency formatting for very large values — proper abbreviations or full display
- Mobile viewport — charts stack vertically

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/web/src/components/charts/theme.ts` — also TASK-06 (creates), TASK-11 (consumes). **Merge strategy: parallel with careful merge** — this task adds report-specific chart constants only; never edit shared axis/tooltip helpers.
- `apps/web/src/lib/api.ts` — also TASK-06 (creates), TASK-07, TASK-09, TASK-11, TASK-14 (add methods). **Merge strategy: parallel with careful merge** — this task adds reports/income methods only; never modify shared helpers.

---

## Testing

### Unit Tests

- [ ] PerformanceComparison renders with portfolio and benchmark lines
- [ ] RealizedPnl renders with realized data
- [ ] IncomeBars renders with monthly income data
- [ ] GranularityToggle switches between month/quarter
- [ ] Empty states render correctly for each section

### Integration Tests

- [ ] Reports page loads and fetches all report data
- [ ] Performance chart data matches API response
- [ ] Granularity toggle refetches with correct parameter
- [ ] Income chart data matches API response

### Manual Validation

- [ ] `pnpm dev` in `apps/web` — reports page renders
- [ ] Toggle granularity — chart updates
- [ ] Responsive: reports look correct on mobile
- [ ] Empty states: reports with no data show CTAs

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
- design-05: Charts, performance palette, states
- design-07: M8 Reports + export + settings (UI portion)
