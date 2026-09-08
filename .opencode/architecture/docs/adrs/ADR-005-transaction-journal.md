# ADR-005: Transaction Journal as Source of Truth with Nota de Corretagem Import

**Status:** Accepted  
**Date:** 2026-09-04

## Context

Investy must track positions accurately across brokers. Users trade via broker apps or home brokers, receive B3 *notas de corretagem* (trade notes), receive dividends, and may hold securities bought in multiple lots at different prices. There are two competing mental models:

- **Holdings-first**: the user edits a running position (quantity + average price).
- **Journal-first**: the user records every transaction and positions are derived.

The user explicitly requested both manual holding entry AND a transaction journal (buy/sell/dividend/split) with B3 nota de corretagem import as day-one V1 features.

## Decision

- The **transaction journal is the single source of truth** for positions. Holdings are derived from it; they are not independently editable state.
- **Manual holding entry** is supported as a convenience input path that materializes as journal entries (e.g., an opening "buy"/"adjustment" transaction with quantity + average price).
- **CSV/JSON import templates** are provided for bulk initial entry.
- **B3 nota de corretagem import** is a V1 feature: the user uploads a nota (PDF/text/CSV), a parser extracts trades into a preview, and the user confirms before the transactions are appended to the journal. Unknown assets are matched against the asset catalog and reported as warnings.
- A `Holding` (asset × portfolio × broker × quantity × average price) is recomputed from the journal and **materialized for reads** so dashboard queries stay fast; invalidation happens on write.
- Corporate actions (split/inplit/desdobramento, JCP, amortization) are first-class journal event types so future positions reconcile with declared reality.
- Realized P&L on sells is computed from the journal (average-cost method) and stored per sale.

## Consequences

### Pros

- Position math is always reproducible and auditable — users can trace a portfolio value back to every nota.
- Import/export round-trips are lossless by construction (import writes journal rows).
- Supports cost-basis accuracy across lots and brokers, required by the consolidation core feature.

### Cons

- Journal derivation adds complexity over a simple holdings table; requires careful migration/backfill for historical holdings (paid via opening transactions).
- B3 nota formats vary between brokers and evolve over time; the parser must be tolerant and versioned.
- Rigorous ownership-scoped, transactional writes are mandatory (journal insert + holding recompute must be atomic).

## Alternatives Considered

- **Holdings as editable source of truth**: rejected — diverges from the notar-based workflow the user wants and makes reconciliation/auditing impossible.
- **Journal in V2, holdings-only in V1**: rejected — the user approved the transaction journal as day-one V1.
- **Manual parsing without preview/confirm flow**: rejected — users must be able to validate parsed data before mutating the journal.