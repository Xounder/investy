# TASK-16 — Canonical Reports API

## Task Information

- **ID:** TASK-16
- **Title:** Mount canonical performance and income reports (M8 API contract gap)
- **Owner:** senior-backend
- **Status:** Pending

## Description

Complete the already-approved design-04 `GET /reports/performance` and `GET /reports/income` contract. TASK-12's mounted-source frontend adapter remains valid while this API is built; do not mislabel observed portfolio-value movement as cash-flow-adjusted return. Build on existing owner-scoped snapshots, benchmarks, journal sale P&L and trusted dividend receipts, not notes or guessed market data.

## Acceptance Criteria

- [ ] Mount authenticated `GET /reports/performance?portfolioId=&granularity=month|quarter` and `GET /reports/income?portfolioId=&from=&to=` under the existing API version; validate parameters and return the established JSON error format (400 invalid input, 404 foreign portfolio).
- [ ] Performance uses actual observed BRL snapshot values, explicit index base/date/convention, period buckets and source/coverage metadata; identify it as an **observed-value index (flows/FX may affect it)**, not time-weighted, money-weighted or cash-flow-adjusted returns. Do not synthesize missing snapshots or returns.
- [ ] Compare CDI, IBOV, IFIX and S&P 500 only from available dated observations on a genuinely common base; expose per-series coverage, missing base/range/last comparable observation, stale/unavailable flags and partial-window disclosures (including short CDI history). No raw daily rate ratio presented as accumulated index.
- [ ] Income endpoint returns owner-scoped, inclusive date-range BRL integer-cent totals by period and asset/class for **trusted paid receipts** (dividend/JCP/amortization classification as appropriate), and separately journal-derived realized sale P&L; preserve incomplete/reconciliation-required labels for legacy/untrusted or unconvertible USD data rather than silently counting them. Sum of breakdowns equals displayed totals; no double counting.
- [ ] Unit/route tests prove granularity/date boundaries, null/empty periods, actual common benchmark base, missing observations, truncated/paginated source coverage, cent precision, invalid input and user-A/user-B isolation; build/typecheck/lint/test pass in `apps/api`. Existing tests remain unchanged.

## Dependencies

- **Required:** TASK-05 (journal/read models), TASK-09 (trusted dividend receipts), TASK-10 (snapshots and benchmark observations; code-QA-approved portions available, calendar/live-DB deferrals remain).
- TASK-12 does **not** depend on this task retroactively: its truthful mounted-data adapter is an independent frontend deliverable. TASK-15 waits for the canonical reports contract before final quarterly-reporting acceptance. No TASK-16 ↔ TASK-17 dependency.

## Technical Context

- API entry/route registration: `apps/api/src/app.ts` and a dedicated reports route/service; consume existing snapshot/benchmark, dividend and journal services. Confirm actual module locations before editing.
- Contract: [design-04](../design-docs/design-04-rest-api-contract.md) (see also [TASK-12](TASK-12-reports-analytics-ui.md)); ADR-004/005/006. BRL is integer cents, API fields/metadata must be unambiguous to the consumer.

## Implementation Guidance

- Establish the report response types and explicit source/coverage semantics before integration; filter by session owner at every query. Avoid duplicating TASK-12's client-side adapters in server code; keep old mounted endpoints working.
- **File Overlap Warning:** `apps/api/src/app.ts` also hosts TASK-03/04/05/08/09/10/13 routes. **Merge strategy:** parallel with careful merge of the reports route-registration section only; never replace existing mounts. If another agent edits the same registration block simultaneously, merge sequentially. Shared snapshot/benchmark services with TASK-10: prefer read-only reuse; coordinate if altering shared functions.

## Edge Cases

- Concurrent snapshot/receipt writes vs request: use a consistent read boundary where available; do not merge mismatched observation dates into one index point.
- No snapshots, one point, missing end date/asset title or absent quote/FX: null/explicit missing coverage, not zero-valued invented returns or guessed income.
- DB failure, benchmark provider timeout/rate limit or stale cache: report an error or clearly partial/stale series without masking as full coverage.
- Extreme dates, quarter/year crossover, many snapshots/transactions, cursor/pagination caps and repeated observations: bound validation, paginate/aggregate without silently dropping rows.
- Preserve existing dashboard/report adapters and owner isolation; never count note-only historic receipts or fabricate a cash-flow-adjusted series.

## Testing

- [ ] Real route/service unit and integration tests assert data/metadata, arithmetic and owner predicates (not just mocked response shapes).
- [ ] `apps/api` build, typecheck, lint and tests pass; live PostgreSQL/provider limitations recorded separately rather than declared passed.

## Definition of Done

- [ ] API endpoints mounted, tested, code QA-approved and remaining environment deferrals reported; task commit per pipeline convention when finalized.

## References

- [Architecture](../../../architecture/architecture.md) · [Architecture index](../../../architecture/index.md) · [design-04](../design-docs/design-04-rest-api-contract.md) · [TASK-12](TASK-12-reports-analytics-ui.md)
