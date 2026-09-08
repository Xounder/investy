# Design 06 — Import/Export and Data Ownership

## Context

### Problem Statement

Investy's data-ownership principle (architecture.md) requires lossless import and full export. Journal-first input paths (manual, CSV/JSON templates, B3 nota import at full scope with rateio de custos) must never corrupt the source-of-truth invariant (ADR-005), and users must be able to leave at any time with every byte they entered. Backups are automated by the worker (ADR-007).

### Goals

- Define input channels and their guarantees: manual entry, CSV/JSON templates, B3 nota (PDF/text/CSV/XML) with preview→confirm.
- Specify export formats (JSON + CSV), full-account erasure, and automated backup with restore verification.
- Define snapshot retention: all daily snapshots retained indefinitely (user-confirmed, no pruning).
- Give backend/QA agents the exact round-trip and reconciliation expectations.

### Constraints

- Journal is the single source of truth: every import path writes journal events atomically with holding recompute.
- Import parsing validates/sanitizes before persisting (ADR-010).
- Backups: worker full JSON export to durable storage + restore verification (ADR-007); platform DB backups (ADR-008).
- Ownership: all user-owned rows exportable and erasable; public market data shared (never exported as user data).

---

## Options Considered

### Option A — Holdings-level import only

#### Description

Import/export positions (current state) rather than journal events.

#### Advantages

- Simple round-trip of current state.

#### Disadvantages

- Loses history; cannot reconcile notas; violates lossless-by-construction (ADR-005).

#### Effort Estimate

Small — rejected.

### Option B — Journal round-trip (lossless) plus readable exports

#### Description

Import produces journal events; export produces both the full journal (lossless round-trip) and human-readable CSV/JSON reports.

#### Advantages

- Import/export round-trips are lossless by construction (ADR-005).
- Satisfies ownership and multi-device needs.

#### Disadvantages

- Export format is richer than a naive positions dump.

#### Effort Estimate

Medium — selected.

### Custom Option (Selected) — Journal round-trip + nota full-scope + automated backups, per approved presentation

#### Description

The settled contract below: manual/CSV/JSON → journal rows; B3 nota full scope (PDF + text/CSV/XML, rateio, reconciliation warnings, preview→confirm); JSON/CSV export; automated worker backups; full account erasure; indefinite snapshot retention.

#### Notes

- Confirmed choices: rateio de custos; preview→confirm split; retain all snapshots.

---

## Decision

### Selected Option

Custom Option B (lossless journal round-trip, nota at full scope, automated backups) as presented and approved.

### Reasoning

- Sole fit with ADR-005 and the ownership principle.
- Indefinite snapshot retention keeps the performance chart lossless over time (no pruning).

### Trade-offs Accepted

- Export/import formats must model journal semantics precisely (types, fees, rateio, corporate events).
- Nota parser is the largest single input surface (versioned, tolerant).

---

## Input Channels

1. **Manual entries** — the "+ Registrar" drawer; writes journal events (buy/sell/dividend/jcp/amortization/split/adjustment; opening for holdings-first users).
2. **CSV/JSON templates** — provided template with columns (type, date, account, symbol, qty, unit price, fees); validated row-by-row; report of errors/warnings; success appends journal rows.
3. **B3 nota de corretagem** — full scope:
   - Input accept: PDF (text-extraction), raw text, CSV, XML (Sinacor family), per-broker layout mapping tolerant.
   - Parser output: nota header (broker, nota number, trade date), negócios rows (C/V, symbol, qty, unit price, day-trade flag), fee block (liquidação, corretagem, emolumentos, ISS, IRRF), **rateio de custos** allocation per operation (largest-remainder, sum == declared total).
   - Unknown assets → catalog-unmatched warnings; duplicate nota (broker+number+date) → dedupe warning.
   - **Preview → confirm**: preview endpoint returns parsed payload + `importToken`; confirm endpoint appends journal atomically; reconciliation summary shows post-import holdings deltas.
4. **Corporate events** — splits/bonificações recognized from provider events and nota parsing; surfaced as events, never silently folded into quantity.

## Export Formats

- **Full journal (lossless)**: JSON — all user-owned rows (portfolios, accounts, transactions w/ rateio allocation, dividends, overrides, snapshots) with schema version; restorable by importing as journal events.
- **Readable exports**: CSV per module (holdings, transactions, dividends, performance) with pt-BR header labels.
- **Availability**: `/export?format=json|csv` streams a single archive; one-click from Settings.

## Backups & Ownership

- **Worker backup job** (ADR-007): scheduled full JSON export to durable storage; idempotent; restore-verified (a restored snapshot is validated by re-deriving holdings == expected totals).
- **Platform**: managed Postgres backups + point-in-time recovery (ADR-008).
- **Account erasure**: `DELETE /settings/account` — hard delete of all user-owned rows in one transaction; confirmation step in UI; backup retention honors a deletion tombstone.
- **Retention**: all daily snapshots retained indefinitely (user-confirmed); no housekeeping pruning of user data; only provider quote/cache rows are subject to TTL/retention.

---

## Impact

### Documentation Affected

- `design-03-domain-data-model.md` (journal math + entities exported)
- `design-04-rest-api-contract.md` (import/export endpoints)

### Architecture Affected

- ADR-005 (input paths), ADR-007 (backup job), ADR-010 (validation at import boundary).

### Dependencies Added

- PDF text-extraction (worker-side), multipart uploads, archive streaming.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Nota layout variants break parsing | High | Medium | Tolerant matcher, per-broker hints, versioned parser, preview catches mismatches before confirm |
| Import partial failure leaves half-applied journal | Low | High | Per-row validation first; atomic confirm transaction; error report without mutation |
| Backup restore not verified in V1 | Medium | High | Worker job runs a restore-validation harness on a separate DB on schedule |
| CSV template drift vs journal schema | Medium | Medium | Template generated from the same zod schema as import validation |

---

## Open Questions

- None — import/export and ownership scope confirmed.