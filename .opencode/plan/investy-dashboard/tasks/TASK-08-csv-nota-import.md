# Task Template

## Task Information

### ID

TASK-08

### Title

CSV Template Import and B3 Nota de Corretagem Import (M5)

### Owner

senior-backend

### Status

Pending

---

## Description

Implement the CSV template import and the full-scope B3 nota de corretagem import with preview→confirm workflow. The CSV import accepts a template with columns (type, date, account, symbol, qty, unit price, fees) and validates row-by-row, reporting errors/warnings before appending journal rows. The nota import accepts PDF (text-extraction), raw text, CSV, and XML (Sinacor family) inputs. The nota parser extracts: broker, nota number, trade date, negócios rows (C/V, symbol, qty, unit price, day-trade flag), fee block (liquidação, corretagem, emolumentos, ISS, IRRF). Rateio de custos allocates fees proportionally per operation using the largest-remainder method. Preview endpoint returns parsed payload with `importToken`. Confirm endpoint appends journal atomically. Unknown assets produce catalog-unmatched warnings. Duplicate nota (broker+number+date) produces dedupe warnings.

---

## Acceptance Criteria

- [ ] `POST /transactions/import/csv` — accepts multipart CSV; validates row-by-row; returns `{ created: n, errors: [] }`
- [ ] CSV validation: checks required fields, valid types, positive qty/price, valid date, existing account/asset
- [ ] CSV import: appends journal rows atomically on success
- [ ] `POST /transactions/import/nota/preview` — accepts multipart (PDF | text | CSV | XML, optional brokerId)
- [ ] Nota parser: extracts nota header (broker, nota number, trade date)
- [ ] Nota parser: extracts negócios rows (C/V direction, symbol, qty, unit price, day-trade flag)
- [ ] Nota parser: extracts fee block (liquidação, corretagem, emolumentos, ISS, IRRF)
- [ ] Rateio de custos: allocates total fees proportionally by operation value; largest-remainder method
- [ ] Rateio: sum of allocated fees equals declared total exactly (±0 cents)
- [ ] Preview response: `{ nota: { brokerId, notaNumber, tradeDate, items[], fees{}, rateio[], warnings[], importToken } }`
- [ ] Warnings: unknown assets, date mismatches, duplicate nota detection
- [ ] `POST /transactions/import/nota/confirm` — accepts `{ importToken }`; appends journal atomically; returns `{ created: n, holdings }`
- [ ] Confirm: 409 if reconciliation issues detected
- [ ] `GET /transactions/import/nota/history` — prior imports for dedupe reference
- [ ] PDF text extraction (server-side, using a library like pdf-parse or similar)
- [ ] All tests pass; build/typecheck/lint clean

---

## Dependencies

### Required Tasks

- TASK-02
- TASK-03
- TASK-05

### Dependency Notes

Requires TASK-02 for the domain engine (rateio allocator, journal event types), TASK-03 for database schema (NotaImport table, Transaction table), and TASK-05 for the journal write service.

---

## Technical Context

### Relevant Components

- `apps/api/src/routes/import-csv.ts` — CSV import endpoint
- `apps/api/src/routes/import-nota.ts` — nota import endpoints (preview, confirm, history)
- `apps/api/src/services/import/csv-parser.ts` — CSV validation and parsing
- `apps/api/src/services/import/nota-parser.ts` — nota parser (PDF/text/CSV/XML)
- `apps/api/src/services/import/rateio.ts` — rateio de custos allocation
- `apps/api/src/services/import/reconciliation.ts` — reconciliation warnings
- `apps/api/src/db/schema.ts` — NotaImport table

### Relevant Modules

- Transactions / Journal (M4 — import path)
- Nota de Corretagem (M5)

### Relevant APIs

- `POST /transactions/import/csv`
- `POST /transactions/import/nota/preview`
- `POST /transactions/import/nota/confirm`
- `GET /transactions/import/nota/history`

### Relevant Types

- `NotaPreview` (brokerId, notaNumber, tradeDate, items[], fees{}, rateio[], warnings[], importToken)
- `NotaItem` (direction, symbol, qty, unitPriceCents, dayTrade)
- `NotaFees` (liquidacao, corretagem, emolumentos, iss, irrf)
- `RateioAllocation` (from packages/domain)
- `ImportWarning` (type, message, details)
- `CsvImportRow` (type, date, account, symbol, qty, unitPriceCents, feeCents)

---

## Implementation Guidance

### Expected Changes

- Implement `apps/api/src/routes/import-csv.ts` — multipart CSV upload, validation, journal write
- Implement `apps/api/src/routes/import-nota.ts` — preview, confirm, history endpoints
- Implement `apps/api/src/services/import/csv-parser.ts` — row-by-row validation with zod
- Implement `apps/api/src/services/import/nota-parser.ts` — multi-format parser (PDF/text/CSV/XML)
- Implement `apps/api/src/services/import/rateio.ts` — fee allocation using domain rateio
- Implement `apps/api/src/services/import/reconciliation.ts` — dedupe, unknown asset, date mismatch warnings
- Implement PDF text extraction (server-side)
- Wire importToken as temp row with TTL or in-memory with expiry
- Store NotaImport records for dedupe reference

### Constraints

- Journal is source of truth: import produces journal events, not direct holding edits (ADR-005)
- Preview→confirm split: preview is stateless-safe; confirm is atomic (design-04/06)
- Rateio uses largest-remainder method; sum must equal declared total exactly (design-03)
- Nota parser must be tolerant of layout variations across brokers (design-01 risk)
- Unknown assets produce warnings, not errors (user can catalog-match later)
- Duplicate nota detection: broker+number+tradeDate (design-03)
- PDF text extraction on server side (not client)
- Upload size limits enforced (ADR-010)
- Atomic confirm: journal write + holding recompute in one DB transaction

### Validation Rules

- CSV: all required fields present; valid transaction type; positive qty/price; valid date; existing account and asset
- Nota: valid PDF/text/CSV/XML format; parseable header; at least one negócio row
- Confirm: importToken must be valid and not expired
- Confirm: no duplicate nota (broker+number+date)
- Rateio: sum of allocated fees == declared total

---

## Edge Cases

- Empty CSV file — return error "no rows found"
- CSV with encoding issues (non-UTF-8) — attempt latin1 fallback
- Nota PDF with no extractable text (scanned image) — return error "unable to extract text"
- Nota with unknown broker format — attempt tolerant parse; flag warnings
- Duplicate nota import — warn on preview; block on confirm (409)
- Nota with corporate actions (split, JCP) — surface as events in preview
- Rateio with single operation — entire fee allocated to that operation
- Rateio with zero total value — handle division by zero; allocate zero to all
- importToken expired — return 400 "token expired, please re-upload"
- Very large nota (many operations) — cap at reasonable limit (e.g., 200 rows)
- Mixed asset classes in single nota — handle each by symbol lookup
- CSV row references non-existent account — report error, continue to next row
- Nota with negative quantities — validate and reject or handle as sell
- Concurrent confirm for same importToken — single transaction prevents double-import

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/api/src/index.ts` — also TASK-03, TASK-04, TASK-05, TASK-09, TASK-13 (each registers its own route module). **Merge strategy: sequential preferred**; if parallelized, merge at the route-registration block only (app.route per resource). This task registers the import routes (`/transactions/import/csv`, `/transactions/import/nota/*`).
- `apps/api/src/db/schema.ts` — also TASK-03 (creates schema incl. NotaImport), TASK-04, TASK-05, TASK-10. **Merge strategy: sequential** — this task consumes the NotaImport and Transaction tables created by TASK-03; do not modify schema definitions.

---

## Testing

### Unit Tests

- [ ] CSV parser: valid row → parsed correctly
- [ ] CSV parser: missing required field → error reported
- [ ] CSV parser: invalid type → error reported
- [ ] Nota parser: PDF text extraction → structured output
- [ ] Nota parser: CSV format → structured output
- [ ] Nota parser: XML format → structured output
- [ ] Rateio allocator: proportional distribution sums to total
- [ ] Rateio allocator: single operation gets full fee
- [ ] Reconciliation: unknown asset → warning
- [ ] Reconciliation: duplicate nota → warning

### Integration Tests

- [ ] CSV import: upload → validate → confirm → journal rows created
- [ ] Nota import: upload PDF → preview → confirm → journal rows created
- [ ] Nota import: duplicate detection on confirm → 409
- [ ] Nota history: list prior imports
- [ ] Rateio: verify sum(fees) == nota total after import

### Manual Validation

- [ ] `pnpm build` in `apps/api` passes
- [ ] `pnpm test` in `apps/api` passes
- [ ] Manual test: upload CSV → preview → confirm
- [ ] Manual test: upload nota PDF → preview → confirm
- [ ] Manual test: duplicate nota → warning on preview

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

- ADR-005: Transaction journal + nota import
- design-03: Rateio de custos, nota lifecycle
- design-04: Import endpoints
- design-06: Import/export scope, nota full scope
- design-07: M5 CSV + nota import milestone (4–5 dev-days)
