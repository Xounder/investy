# ADR-007: Scheduled Sync Worker

**Status:** Accepted  
**Date:** 2026-09-04

## Context

Market data and portfolio history are best kept fresh on a schedule rather than on-demand:

- Quotes should refresh intraday (TTL) and settle at the daily close.
- The performance-over-time chart needs a daily `PortfolioSnapshot`.
- The dividend agenda needs periodic provider refresh.
- Backups of user data should be automated and testable.

The worker must share schema and domain logic with the API and remain a single deploy unit (see ADR-002).

## Decision

- A **worker process** runs inside `apps/api` as a separate entrypoint (`start:worker`), scheduled via `node-cron` on the application layer (with platform cron as a supporting mechanism in production).
- Jobs:

  1. **Quote refresh** — refresh cached quotes for all tracked assets under the provider cache TTL and retry logic; settle the final daily close value.
  2. **Daily portfolio snapshot** — persist per-user `PortfolioSnapshot` rows (total value + allocation) for the performance chart.
  3. **Dividend agenda refresh** — update upcoming/past proventos for tracked assets from providers.
  4. **Backup** — scheduled full **JSON export** of all user data to durable storage, plus verification that exported files restore.
  5. **Housekeeping** — prune stale/high-volume cache rows beyond retention limits.

- Jobs are **idempotent and resumable** (last-processed markers, dedupe by symbol+date), so overlapping runs or manual re-runs are safe.
- All job runs log status for observability; failures are isolated per job and do not cascade.
- Worker timezone context is `America/Sao_Paulo` for market day boundaries; storage remains UTC (see ADR-004).

## Consequences

### Pros

- Data freshness and the performance history do not depend on user activity — the dashboard works even before the user opens it.
- Backups and snapshot integrity are automated and observable, meeting the "daily backups" and "performance over time" success criteria.
- Idempotency makes scheduling robust across the free platforms' cron limits.

### Cons

- One more process to run and monitor (kept minimal by sharing the `apps/api` package).
- Free hosting tiers may cap scheduled-job frequency; mitigated by relying on the worker's own scheduler plus on-demand refresh.
- Timezone/holiday handling for the Brazilian market calendar adds small complexity.

## Alternatives Considered

- **Trigger everything from API requests**: rejected — history gaps when the user is absent; no automated backups.
- **External cron (only)**: rejected — platform cron limits are restrictive; keeping the schedule inside the process is simpler and portable.
- **Serverless scheduled functions**: considered; deferred — heavier DevOps than a long-running worker for V1.