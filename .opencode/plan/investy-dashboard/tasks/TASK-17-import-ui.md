# TASK-17 — CSV and Nota Import UI

## Task Information

- **ID:** TASK-17
- **Title:** Make CSV and nota import preview/confirm/history operable (M5 UI gap)
- **Owner:** senior-frontend
- **Status:** Pending

## Description

Replace the `/transactions/import/nota` placeholder and expose the approved CSV template upload and B3 nota PDF/text/CSV/XML flow in the existing app shell. Use the **already implemented, code-QA-approved TASK-08 endpoints** and the journal/holding cache conventions; no client-side nota parsing or new backend contract. This closes the missing UI path for TASK-15's Nota Day journey.

## Acceptance Criteria

- [ ] Route/navigation/transaction CTA open a working import page; accessible, responsive, pt-BR UI follows TASK-06 tokens with distinct CSV and nota input paths (file selector for PDF/CSV/XML and raw text input); supported formats, size constraints and account/broker selection are visible.
- [ ] `POST /transactions/import/csv` uses actual multipart template import; display per-row validation errors, warnings and created count, prevent accidental duplicate submit, and offer a downloadable/example template consistent with the current API schema (do not invent a CSV preview token if backend only imports directly).
- [ ] `POST /transactions/import/nota/preview` displays header, trades, corporate events, fee/rateio totals in integer cents formatted pt-BR, unknown-asset/date/dedupe warnings and reconciliation issues; require explicit review before `POST /transactions/import/nota/confirm` with the returned `importToken` only.
- [ ] Confirm displays created count and holding changes, refreshes transaction/holding/portfolio/dashboard/dividend/report queries where applicable; `GET /transactions/import/nota/history` lists prior imports and dedupe references scoped to the logged-in user.
- [ ] Network failures, 400/409 (including reconciliation), expired/reused token, unsupported/scanned PDF and duplicate nota preserve entered file/text/selection as appropriate, clear unsafe tokens, and provide retry/re-preview without silent partial success; don't confirm stale previews after user changes selection.
- [ ] Unit tests for format switching, warnings/rateio, empty and error states, token lifecycle and cache invalidation; Playwright E2E upload → preview → confirm → journal grows plus duplicate/error recovery against Investy, using real API/test DB or deterministic test fixtures. Budget ~30 seconds per Playwright run; batch browser runs. Web build/typecheck/lint/test pass; existing tests unchanged.

## Dependencies

- **Required:** TASK-06 (shell/tokens), TASK-07 (journal UI/query keys), TASK-08 (approved import APIs). TASK-08 live PostgreSQL/real-broker deferrals remain explicit.
- TASK-16 is independent: backend reports and frontend import may execute in parallel. TASK-15 final Nota Day E2E depends on TASK-17; retain TASK-08 as its backend prerequisite.

## Technical Context

- Integrate existing `apps/web` routes, transaction entry links, API client and TanStack Query keys; inspect actual modules before implementation. API contract: `POST /transactions/import/csv`, `POST /transactions/import/nota/preview`, `POST /transactions/import/nota/confirm`, `GET /transactions/import/nota/history` ([TASK-08](TASK-08-csv-nota-import.md), [design-04](../design-docs/design-04-rest-api-contract.md), [design-06](../design-docs/design-06-import-export-data-ownership.md)).
- ADR-005 journal is sole source of truth, ADR-006 owner isolation; do not persist import tokens/client files across accounts.

## Implementation Guidance

- Scope page components/tests to import module; reuse shared loading/error/empty components and API error envelopes. Invalidate only after confirmed server success; navigation from dashboard and transactions must reach the same live route.
- **File Overlap Warning:** `apps/web/src/lib/api.ts` and route configuration overlap TASK-06/07/09/11/12/14; shared transaction/dashboard cache keys may overlap TASK-12 or TASK-15. **Merge strategy:** parallel with careful merge: append import-specific API methods and route entries in separate sections, preserve existing helpers; if another task edits identical lines, merge sequentially. TASK-15's E2E files should be scheduled after this task, not edited concurrently.

## Edge Cases

- Race: slow preview for file A arrives after choosing file B; reject stale token/results; two confirm clicks or tabs must not duplicate journals.
- Empty file/text, no history, missing broker/account, missing title/end date on affected records: show safe fallback and no fabricated operation.
- Upload too large, malformed CSV/XML, scanned PDF, timeout, unavailable API, expired process-local token or 409 duplicate/reconciliation: actionable message, no claim of success.
- Many trade lines/fees, rounding to exact cents, mixed asset classes, corporate actions and repeated nota numbers across owners: render complete bounded preview with faithful warnings; no client-side rateio recomputation.
- Regression: journal, dashboard, reports, dividends, existing registration drawer and back/deep links remain functional after import.

## Testing

- [ ] Unit/component tests with behavior assertions for asynchronous preview and actual mutation/cache effects.
- [ ] Playwright Nota Day and failure/dedupe flows (~30s per run) and `apps/web` build/typecheck/lint/test; report environmental test DB limitations honestly.

## Definition of Done

- [ ] Operative UI, validation, E2E and code QA complete; task commit per pipeline convention when finalized.

## References

- [Architecture](../../../architecture/architecture.md) · [design-04](../design-docs/design-04-rest-api-contract.md) · [design-06](../design-docs/design-06-import-export-data-ownership.md) · [TASK-08](TASK-08-csv-nota-import.md) · [TASK-15](TASK-15-e2e-hardening.md)
