# ADR-001: Full-Stack Option C Architecture

**Status:** Accepted  
**Date:** 2026-09-04

## Context

Investy is a portfolio dashboard for Brazilian retail investors. The product must consolidate holdings across brokers, track transactions (including automated B3 trade-note import), value positions from live quotes, track dividends, and report performance over time. The user requested multi-user support and multi-device access from day one.

Initial options presented during the Architecture Initializer phase:

- **Option A**: Static SPA only (React + Vite, public APIs or manual entry, localStorage).
- **Option B**: SPA + thin BFF/API server (Express/Node), market-data proxying, caching, daily backups.
- **Option C**: SPA + full backend with database (Postgres/SQLite), scheduled sync, auth-capable.

## Decision

Adopt **Option C**: a full-stack architecture composed of:

- React + Vite SPA (`apps/web`).
- Node.js + Hono API (`apps/api`) providing auth, REST endpoints, market-data proxy with cache, and import/export.
- Managed **PostgreSQL** as the single system of record for all user data and cached market data.
- A separate scheduled **worker process** (hosted inside `apps/api`) for quote refresh, daily snapshots, dividend agenda, and backups.
- **Multi-user authentication** and per-user data isolation from the first release.

## Consequences

### Pros

- Multi-user and multi-device are first-class, satisfying a stated requirement from day one.
- A durable database enables performance-over-time charts, import reconciliation, and export/backup guarantees.
- The server-side market-data proxy keeps provider keys secret and enables caching/fallback strategies.
- Postgres gives transactional guarantees for the transaction journal (the core invariant of position math).
- Architecture scales cleanly from personal use to a published product without a rewrite.

### Cons

- Higher implementation effort than Options A/B (estimated 4-6 weeks for MVP).
- Managed Postgres and hosting add small recurring infrastructure cost.
- More moving parts to operate and test than a static SPA.

## Alternatives Considered

- **Option A (static SPA)**: rejected — no secrets-safe market-data path, no multi-user, no durable history, browser storage loss risk.
- **Option B (thin BFF)**: recognized as insufficient for the multi-user requirement; would still require a database and auth, converging on Option C with worse data guarantees.
- **SQLite instead of Postgres**: rejected for the multi-user/multi-device requirement — see ADR-004.