# ADR-004: PostgreSQL as System of Record

**Status:** Accepted  
**Date:** 2026-09-04

## Context

The product requires multi-user data isolation, a transactional transaction journal (buy/sell/dividend/split), daily portfolio snapshots, a quote cache, and import reconciliation. Returns and YTD figures are money math where rounding errors from floating-point arithmetic are unacceptable.

## Decision

- Use **managed PostgreSQL** as the single system of record for all data (users, portfolios, transactions, holdings, dividends, quotes, snapshots, benchmark series).
- Use **Drizzle ORM** for schema, migrations, and typed queries.
- Store all monetary values as **integer cents (BIGINT)**. Derived percentages/returns are computed as numbers only for display, never persisted as truth.
- All user-owned tables carry an **owner/user id** and are accessed through an ownership-scoped repository layer.
- Timestamps stored in UTC; timezone-sensitive rendering (market dates, dividend ex-dates, portfolio snapshots) happens at the presentation layer using `America/Sao_Paulo`.

## Consequences

### Pros

- Transactional guarantees protect the core invariant: positions must reconcile exactly with the journal.
- Integer-cent money eliminates float drift in BRL accumulation across many transactions.
- Managed Postgres (Neon/Supabase/Railway) removes ops burden: backups, TLS, and point-in-time recovery are platform-provided.
- Drizzle keeps schema and migrations versioned and typed, with a single source of truth for both API and worker.

### Cons

- Managed Postgres adds a small recurring cost and an external dependency.
- ORM introduces an abstraction layer; complex analytics queries may occasionally need raw SQL.
- Backups of user data must be explicitly configured and periodically verified (platform-level).

## Alternatives Considered

- **SQLite**: rejected — limited concurrency and journaling model; not a fit for multi-user/multi-device day-one requirement; migration to Postgres later would be a rewrite.
- **localStorage / IndexedDB (Option A)**: rejected — no multi-device, data-loss risk on browser wipe.
- **Prisma/TypeORM instead of Drizzle**: considered — Drizzle chosen for lightweight query builder, TS-native ergonomics, and the same schema usable from both API and worker.
- **Floating-point money**: rejected — risk of accumulation errors in position math and dividend tracking.