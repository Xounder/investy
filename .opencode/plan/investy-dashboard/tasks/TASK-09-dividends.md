# Task Template

## Task Information

### ID

TASK-09

### Title

Dividend Tracking — Agenda, Status Workflow, FII Projection, Income History (M6)

### Owner

senior-backend

### Status

Pending

---

## Description

Implement dividend tracking across backend API and frontend UI. On the backend: implement the dividend agenda endpoint (expected/confirmed/paid items with projections), income history endpoint (by month/asset), and dividend CRUD (POST create, PATCH status/paymentDate for user confirmation). Implement FII cadence-based dividend projection (predict next payment based on historical ex-date cadence). On the frontend: build the dividend agenda screen with timeline view (ex-date primacy, pay-date chip with status workflow), income by month/asset view, and FII projection cards with confidence labels. The dividend agenda shows expected/confirmed/paid status; user can confirm a payment date to promote status. Provider sync populates dividends from market data; manual entry is also supported.

---

## Acceptance Criteria

- [ ] `GET /dividends/agenda?from=&to=` — returns expected/confirmed/paid items with optional projections
- [ ] `GET /dividends/history?month=&year=` — returns income by month/asset
- [ ] `POST /dividends` — create dividend record (assetId, kind, exDate, paymentDate?, rateCentsPerUnit)
- [ ] `PATCH /dividends/:id` — update status or paymentDate (user confirmation)
- [ ] Dividend kinds: dividend, jcp, rendimento, amortizacao (from design-03)
- [ ] FII cadence projection: predict next ex-date based on historical pattern; confidence label
- [ ] Provider dividend sync: fetches from brapi `/fiis/dividends` or equivalent
- [ ] Frontend: `/dividends` page with agenda timeline and income history tabs
- [ ] Agenda timeline: ex-date primary, pay-date chip (expected/confirmed/paid), per-asset grouping
- [ ] Income view: bars or table by month/asset, total income
- [ ] FII projection cards: next projected payment, cadence, confidence
- [ ] Status workflow: expected → confirmed (user confirms pay date) → paid
- [ ] Loading skeletons and empty states for all views
- [ ] All tests pass; build/typecheck/lint clean

---

## Dependencies

### Required Tasks

- TASK-03
- TASK-04
- TASK-05
- TASK-06

### Dependency Notes

Requires TASK-03 for database schema (Dividend table), TASK-04 for market data provider (dividend sync), TASK-05 for the journal write service (dividend events), and TASK-06 for UI foundation (components, layout).

---

## Technical Context

### Relevant Components

- `apps/api/src/routes/dividends.ts` — dividend endpoints
- `apps/api/src/services/dividends.ts` — dividend business logic
- `apps/api/src/services/dividends/projection.ts` — FII cadence projection
- `apps/api/src/services/dividends/sync.ts` — provider sync
- `apps/web/src/pages/Dividends.tsx` — dividends page
- `apps/web/src/components/dividends/AgendaTimeline.tsx` — agenda timeline
- `apps/web/src/components/dividends/IncomeHistory.tsx` — income by month/asset
- `apps/web/src/components/dividends/FiiProjectionCard.tsx` — FII projection

### Relevant Modules

- Dividends module (M6)

### Relevant APIs

- `GET /dividends/agenda`
- `GET /dividends/history`
- `POST /dividends`
- `PATCH /dividends/:id`

### Relevant Types

- `Dividend` (id, userId, assetId, kind, exDate, paymentDate, rateCentsPerUnit, status, source)
- `DividendKind` (dividend/jcp/rendimento/amortizacao)
- `DividendStatus` (expected/confirmed/paid)
- `AgendaItem` (dividend + asset info + projection)
- `IncomeByMonth` (month, year, totalCents, items[])
- `FiiProjection` (assetId, nextExDate, cadence, confidence)

---

## Implementation Guidance

### Expected Changes

- Implement `apps/api/src/routes/dividends.ts` — agenda, history, CRUD
- Implement `apps/api/src/services/dividends.ts` — business logic
- Implement `apps/api/src/services/dividends/projection.ts` — FII cadence projection
- Implement `apps/api/src/services/dividends/sync.ts` — provider sync from brapi
- Implement `apps/web/src/pages/Dividends.tsx` — page with tabs (agenda/history)
- Implement `apps/web/src/components/dividends/AgendaTimeline.tsx` — timeline with status chips
- Implement `apps/web/src/components/dividends/IncomeHistory.tsx` — income bars/table
- Implement `apps/web/src/components/dividends/FiiProjectionCard.tsx` — projection card
- Wire agenda/summary endpoints for dashboard preview

### Constraints

- Dividend agenda uses ex-date primacy (design-02)
- Pay-date is user-confirmable (provider gives ex-date reliably; paymentDate is competence ref)
- FII cadence projection labels confidence (not guaranteed) (design-01 risk)
- Amortização is distinct from rendimento (return of capital, not income) (design-03)
- Provider sync populates from brapi; manual entry also supported
- Status workflow: expected → confirmed → paid (design-02)
- pt-BR labels throughout

### Validation Rules

- Dividend kind must be one of: dividend, jcp, rendimento, amortizacao
- ExDate must be valid date
- PaymentDate must be after ExDate (if provided)
- RateCentsPerUnit must be positive
- Status transitions: expected→confirmed, confirmed→paid (no backward)
- User can only confirm dividends they own

---

## Edge Cases

- No dividends for date range — return empty array
- FII with irregular cadence — projection confidence is "low"
- FII with single historical payment — insufficient data for projection
- Provider sync fails — dividends remain as-is (no data loss)
- Duplicate dividend (same asset + exDate) — warn or dedupe
- Amortização displayed as income — must label as "return of capital"
- Very old dividends (years ago) — still shown in history
- Dividend with no matching asset in catalog — warn
- Status update race condition (two users) — last write wins
- Empty agenda — show empty state with CTA to sync or add manually

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/api/src/index.ts` — also TASK-03, TASK-04, TASK-05, TASK-13 (each registers its own route module). **Merge strategy: sequential preferred**; if parallelized, merge at the route-registration block only (app.route per resource).
- `apps/web/src/lib/api.ts` — also TASK-06 (creates), TASK-07, TASK-11, TASK-12, TASK-14 (add methods). **Merge strategy: parallel with careful merge** — this task adds dividend agenda/history methods only; never modify shared helpers.

---

## Testing

### Unit Tests

- [ ] FII cadence projection: regular payments → correct next ex-date
- [ ] FII cadence projection: irregular payments → low confidence
- [ ] Status workflow: expected → confirmed → paid transitions
- [ ] Status workflow: invalid transitions rejected
- [ ] Income aggregation: correct totals by month/asset

### Integration Tests

- [ ] Agenda endpoint returns expected/confirmed/paid items
- [ ] History endpoint returns income by month
- [ ] Create dividend → appears in agenda
- [ ] Confirm dividend status → updates to confirmed
- [ ] Provider sync populates dividends

### Manual Validation

- [ ] `pnpm build` passes for both apps/api and apps/web
- [ ] `pnpm test` passes
- [ ] Manual test: view agenda → confirm a dividend → status updates
- [ ] Manual test: view income history → correct totals

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

- ADR-003: Market data proxy (dividend sync)
- ADR-005: Transaction journal (dividend events)
- design-03: Dividend entities, FII projection
- design-04: Dividend endpoints
- design-07: M6 Dividends milestone (3 dev-days)
