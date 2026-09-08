# Task Template

## Task Information

### ID

TASK-13

### Title

Export, Backup Status, and Account Erasure API (M8 Backend)

### Owner

senior-backend

### Status

Pending

---

## Description

Implement the backend data-ownership surface: the export endpoint (JSON lossless journal round-trip + CSV readable per-module exports), the backup status endpoint, the overrides list endpoint, and the account erasure endpoint. The export must be lossless: JSON export includes all user-owned rows with a schema version and is restorable by re-importing as journal events. CSV export produces per-module files (holdings, transactions, dividends, performance) with pt-BR headers. Account erasure hard-deletes all user-owned rows in a single atomic transaction. Endpoints are scoped to the authenticated user.

---

## Acceptance Criteria

- [ ] `POST /export?format=json|csv` — streams user data as JSON or CSV archive
- [ ] JSON export: all user-owned rows (portfolios, accounts, transactions with rateio allocation, dividends, overrides, snapshots) with schema version
- [ ] CSV export: per-module CSV files (holdings, transactions, dividends, performance) with pt-BR headers
- [ ] Export scoped to authenticated user only; no other user's data ever included
- [ ] JSON BigInt (integer-cent) values serialized safely (as strings or number-safe)
- [ ] `GET /settings/backups` — returns last backup, status, retention note
- [ ] `GET /settings/overrides` — returns list of user price overrides
- [ ] `DELETE /settings/account` — hard delete of all user-owned rows; requires confirmation payload (e.g., current password or typed email)
- [ ] Account erasure: atomic transaction; no partial delete
- [ ] Export/erasure endpoints protected by auth middleware (require session)
- [ ] All tests pass; build/typecheck/lint clean

---

## Dependencies

### Required Tasks

- TASK-03
- TASK-05

### Dependency Notes

Requires TASK-03 for the auth middleware and database schema, and TASK-05 for the ownership-scoped repository layer.

---

## Technical Context

### Relevant Components

- `apps/api/src/routes/export.ts` — export endpoint
- `apps/api/src/routes/settings.ts` — backup status, overrides list, account erasure
- `apps/api/src/services/export.ts` — export serialization logic
- `apps/api/src/services/erasure.ts` — account erasure logic

### Relevant Modules

- Settings / Data module (M9)
- Import/export & data ownership (design-06)
- Worker backups (ADR-007)

### Relevant APIs

- `POST /export`
- `GET /settings/backups`
- `GET /settings/overrides`
- `DELETE /settings/account`

### Relevant Types

- `ExportData` (schemaVersion, portfolios, accounts, transactions, dividends, overrides, snapshots)
- `BackupStatus` (lastBackup, status, retentionNote)
- `Override` (assetId, priceCents, currency, createdAt)

---

## Implementation Guidance

### Expected Changes

- Implement `apps/api/src/routes/export.ts` — export endpoint with format switch
- Implement `apps/api/src/services/export.ts` — data serialization for JSON and CSV
- Implement `apps/api/src/routes/settings.ts` — backup status, overrides list, account erasure
- Implement `apps/api/src/services/erasure.ts` — atomic deletion of all user-owned rows
- Add zod schemas for export format and erasure confirmation
- Wire routes into the Hono app

### Constraints

- Export is lossless: JSON includes the full journal, not just current state (design-06)
- CSV export uses pt-BR header labels (design-06)
- Account erasure is atomic: one DB transaction deletes all user-owned rows (design-06)
- Erasure requires confirmation (typed email or current password) before executing
- Export/erasure scoped to authenticated user (ADR-006)
- Streaming export for large datasets — do not buffer entire payload in memory
- Snapshots retained in export (no pruning per user confirmation, design-06)
- Backup retention honors a deletion tombstone after erasure (design-06)

### Validation Rules

- Export only includes the authenticated user's data
- JSON export includes a schema version field
- All money fields exported as integer cents (no floating-point drift in export)
- Erasure rejects requests without valid confirmation
- Erasure deletes rows from all user-owned tables in sequence within one transaction

---

## Edge Cases

- Export with no data — return valid empty structure with schema version
- Very large export — stream response incrementally
- Export CSV with special characters in strings — proper CSV escaping
- Export JSON with BigInt cents — serialize safely (JSON has no BigInt)
- Erasure while worker runs snapshot/backup jobs — handle gracefully (foreign key checks)
- Erasure confirmation with wrong email/password — reject with 403
- Erasure of user with no data — succeed idempotently
- Backup status with no backups yet — return "no backups" state
- Overrides list is empty — return empty array
- Concurrent export requests — each streams independently; no shared state
- Partial export failure (mid-stream) — client retries; no server-side corruption

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/api/src/index.ts` — also TASK-03, TASK-04, TASK-05, TASK-09 (each registers its own route module). **Merge strategy: sequential preferred**; if parallelized, merge at the route-registration block only (app.route per resource).
- `apps/api/src/middleware/auth.ts` — also TASK-03 (creates), TASK-05 (consumes). **Merge strategy: parallel with careful merge** — this task imports only; never modify middleware internals.
- `apps/api/src/repositories/` — also TASK-03 (base), TASK-05 (entity repos). **Merge strategy: parallel with careful merge** — add export/erasure repository files only; never modify the base class.

---

## Testing

### Unit Tests

- [ ] JSON export serializer: includes all user-owned tables
- [ ] JSON export serializer: BigInt cents serialized safely
- [ ] CSV export generator: correct pt-BR headers
- [ ] CSV export generator: special characters escaped
- [ ] Erasure: deletes all user-owned rows atomically
- [ ] Erasure: rejects invalid confirmation

### Integration Tests

- [ ] Export: user A exports → user B's data absent
- [ ] Export: JSON structure is valid and restorable
- [ ] Erasure: confirm → all data deleted → subsequent requests 401
- [ ] Backup status: returns worker-written status
- [ ] Overrides list: returns user overrides only

### Manual Validation

- [ ] `pnpm build` in `apps/api` passes
- [ ] `pnpm test` in `apps/api` passes
- [ ] Manual: export JSON → verify structure and contents
- [ ] Manual: export CSV → verify files and headers
- [ ] Manual: erasure flow → confirm → data gone

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

- ADR-005: Transaction journal (lossless export)
- ADR-006: Multi-user isolation (scoped export)
- ADR-007: Worker backups
- design-06: Export formats, erasure, retention
- design-04: Export and data-ownership endpoints
- design-07: M8 Reports + export + settings (backend portion)