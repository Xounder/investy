# Task Template

## Task Information

### ID

TASK-10

### Title

Scheduled Worker — Quotes, Snapshots, Dividend Agenda, Backups (M7 Worker)

### Owner

senior-backend

### Status

Pending

---

## Description

Implement the scheduled worker process inside `apps/api` (ADR-007) that runs periodic jobs: quote refresh (intraday TTL), daily portfolio snapshots (market close in America/Sao_Paulo), dividend agenda sync, and automated backups. The worker shares the schema and domain code from `apps/api` and `packages/domain`. Implement a job scheduler (node-cron or platform cron) that orchestrates these jobs. The quote refresh job fetches latest prices from the market data proxy and updates the Quote cache. The snapshot job computes daily portfolio totals and persists PortfolioSnapshot rows. The dividend agenda job syncs dividends from providers. The backup job exports user data to durable storage and runs restore verification.

---

## Acceptance Criteria

- [ ] Worker process entry point: `apps/api/src/worker.ts` or `apps/api/src/worker/index.ts`
- [ ] Job scheduler configured with cron expressions for each job
- [ ] Quote refresh job: iterates tracked assets; fetches from QuoteProvider; updates Quote cache with TTL
- [ ] Quote refresh: respects rate limits; degrades gracefully on provider failure
- [ ] Snapshot job: computes daily portfolio totals (totalValueCents, costBasisCents, allocationJsonb)
- [ ] Snapshot job: runs at market close in America/Sao_Paulo (e.g., 18:00 BRT)
- [ ] Snapshot job: idempotent (re-run does not create duplicates for same date+portfolio)
- [ ] Snapshot job: backfill capability for missed days (capped, resumable) (design-07)
- [ ] Dividend agenda job: syncs from brapi provider; creates/updates Dividend records
- [ ] Backup job: full JSON export of user-owned data; idempotent
- [ ] Backup job: restore verification (derive holdings from export → compare totals)
- [ ] All jobs log execution status (start, success, failure, duration)
- [ ] All jobs handle errors gracefully (log and continue, don't crash worker)
- [ ] Worker can be run independently: `pnpm worker` script in apps/api
- [ ] All tests pass; build/typecheck/lint clean

---

## Dependencies

### Required Tasks

- TASK-02
- TASK-03
- TASK-04

### Dependency Notes

Requires TASK-02 for domain engine (snapshot computation), TASK-03 for database schema (PortfolioSnapshot, Quote, BenchmarkSeries tables), and TASK-04 for market data providers (quote refresh, dividend sync).

---

## Technical Context

### Relevant Components

- `apps/api/src/worker/index.ts` — worker entry point
- `apps/api/src/worker/scheduler.ts` — job scheduler
- `apps/api/src/worker/jobs/quote-refresh.ts` — quote refresh job
- `apps/api/src/worker/jobs/snapshot.ts` — daily snapshot job
- `apps/api/src/worker/jobs/dividend-sync.ts` — dividend agenda sync
- `apps/api/src/worker/jobs/backup.ts` — backup job
- `apps/api/src/worker/jobs/benchmark-sync.ts` — benchmark series sync

### Relevant Modules

- Scheduled worker (ADR-007)
- Market data proxy (ADR-003)
- Portfolio snapshots (design-03)
- Backups (design-06)

### Relevant APIs

- None (worker is a background process, not an API server)
- Reads/writes to same database as API

### Relevant Types

- `PortfolioSnapshot` (id, userId, portfolioId, date, totalValueCents, costBasisCents, allocationJsonb)
- `Quote` (assetId, priceCents, currency, fxRateToBRL, source, fetchedAt, validUntil)
- `BenchmarkSeries` (symbol, date, value)
- `JobStatus` (running, success, failed, duration)

---

## Implementation Guidance

### Expected Changes

- Implement `apps/api/src/worker/index.ts` — worker entry, imports scheduler
- Implement `apps/api/src/worker/scheduler.ts` — cron-based job scheduling
- Implement `apps/api/src/worker/jobs/quote-refresh.ts` — fetch prices, update cache
- Implement `apps/api/src/worker/jobs/snapshot.ts` — compute and persist daily snapshots
- Implement `apps/api/src/worker/jobs/dividend-sync.ts` — sync dividends from providers
- Implement `apps/api/src/worker/jobs/backup.ts` — export + restore verification
- Implement `apps/api/src/worker/jobs/benchmark-sync.ts` — sync benchmark series
- Add `pnpm worker` script to apps/api package.json
- Add job logging (start, success, failure, duration)

### Constraints

- Worker shares schema and domain code with API (ADR-007)
- Jobs are idempotent (re-runs don't create duplicates) (ADR-007)
- Snapshot runs at market close in America/Sao_Paulo (design-03)
- All snapshots retained indefinitely (no pruning) (design-06)
- Backup restore verification: derive holdings from export, compare to expected totals
- Quote refresh respects provider rate limits (ADR-010)
- Worker handles errors gracefully (log and continue)
- Backfill for missed snapshots: capped per run, resumable (design-07)

### Validation Rules

- Snapshot date must be a trading day (skip weekends/holidays or compute for last trading day)
- Quote refresh must not exceed provider rate limits
- Backup must be complete (all user-owned tables)
- Restore verification must match totals exactly

---

## Edge Cases

- Provider API down during quote refresh — skip affected symbols, log warning, continue
- Snapshot job runs twice for same date — idempotent (upsert, not insert)
- Holiday weekend — snapshot uses last trading day
- Very large user base — quote refresh must batch and respect rate limits
- Backup of user with no data — export empty but valid structure
- Restore verification fails — log error, alert, don't crash
- Worker process crash mid-job — next run picks up (idempotent)
- FX rate unavailable during snapshot — use last known rate, flag
- Dividend sync returns duplicate — upsert on asset+exDate
- Benchmark series gap (missing dates) — interpolate or skip
- Memory pressure with many portfolios — process in batches

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/api/src/db/schema.ts` — also TASK-03 (creates), TASK-04 (adds quote/catalog tables). **Merge strategy: sequential** — this task consumes the schema; do not modify table definitions. If a job needs an index, add it via a new migration, not by editing existing schema definitions.
- `apps/api/src/services/market-data/` — also TASK-04 (creates providers/cache). **Merge strategy: sequential** — this task consumes the providers; never modify provider internals.

---

## Testing

### Unit Tests

- [ ] Snapshot computation: correct totals for given holdings
- [ ] Snapshot idempotency: re-run doesn't duplicate
- [ ] Quote refresh: updates cache with new prices
- [ ] Backup: exports all user-owned tables
- [ ] Restore verification: derives holdings from export

### Integration Tests

- [ ] Snapshot job: run → PortfolioSnapshot rows created
- [ ] Quote refresh: run → Quote rows updated
- [ ] Dividend sync: run → Dividend records created
- [ ] Backup job: run → export file created
- [ ] Worker starts and scheduler runs jobs

### Manual Validation

- [ ] `pnpm build` in `apps/api` passes
- [ ] `pnpm test` in `apps/api` passes
- [ ] `pnpm worker` starts and logs job execution
- [ ] Snapshot job creates PortfolioSnapshot for today

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

- ADR-003: Market data proxy
- ADR-007: Scheduled worker
- design-03: Snapshots, quotes, FX
- design-06: Backups, retention
- design-07: M7 Dashboard + snapshots (worker portion)
