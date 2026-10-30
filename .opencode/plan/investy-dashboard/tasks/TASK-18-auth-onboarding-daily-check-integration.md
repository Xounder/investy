# TASK-18 — Auth, Onboarding and Daily-Check Integration

## Task Information

- **ID:** TASK-18
- **Title:** Complete approved signup/onboarding, asset override and reports-export UI paths
- **Owner:** senior-frontend
- **Status:** Pending

## Description

TASK-15 readiness found that approved design-02 journeys cannot yet be exercised end to end: signup does not submit registration, onboarding is local-only, asset detail has no price-override write/reset control, and reports has no export entry. Close these frontend integration gaps in one bounded implementation task; TASK-15 remains the real-database six-journey/security harness and must not alter application source. The backend agent independently verifies persisted registration/session behavior and supplies exact existing API contracts; **a backend bug is not yet confirmed**. Do not mark TASK-03 broken or change its status based on preflight alone.

## Acceptance Criteria

- [ ] Connect signup to the verified registration API; check and integrate login against the actual session contract rather than assuming login is broken. Validate fields and show actionable pt-BR API/validation/duplicate/rate-limit errors without navigating on failure. On success, establish/restore the httpOnly-cookie session and route to onboarding/dashboard as appropriate; do not put credentials or tokens in browser storage.
- [ ] Implement real logout/session-expiry handling: use the verified API, clear user-scoped TanStack Query cache and transient owner-specific state, guard protected routes and prevent prior-user data flashing on account switch, refresh or concurrent auth requests. Keep unauthenticated screens usable.
- [ ] Replace local-only onboarding with owner-scoped persisted default portfolio, broker and account creation/selection using existing approved APIs; support the optional first journal entry through the existing register flow (or route into import), then dashboard. Refresh/revisit resumes from server state without duplicate default resources. Do not fabricate a first entry or holdings.
- [ ] In `AssetDrawer` add accessible create/update and clear/reset manual quote override controls against the existing authenticated `PATCH /assets/:symbol/override` contract and its verified clear/reset behavior; convert entered native-currency prices to **exact integer cents** without float truncation, label quote currency/BRL valuation and stale/manual state truthfully, invalidate affected asset, market, holdings, summary, dashboard and reports queries after successful mutation. Handle server errors and ownership correctly.
- [ ] Add a small pt-BR export CTA on Reports linking to the **actual working Settings download**, not a fabricated reports export endpoint; update only obsolete/stale comments related to these integrated UI flows.
- [ ] New behavior-focused component/unit and deterministic API-fixture browser E2E tests cover signup/login/logout/session switching, persisted onboarding/first entry/navigation, override write/reset, native-cent conversion, cross-user cache isolation, and Reports→Settings export. Keep existing tests/config untouched; TASK-15 owns real-DB six-journey E2E. Batch Playwright runs (~30s each). Build/typecheck/lint/test in `apps/web`; keep authored files <=400 lines.

## Dependencies

### Required Tasks

- TASK-03 — auth/session, owner-scoped backend contract; backend verification of registration persistence still pending.
- TASK-06 — routing, auth shell, tokens.
- TASK-07 — existing register/first journal entry and asset detail UI.
- TASK-14 — actual Settings export download target (already consumes TASK-13 export API).

### Dependency Notes

TASK-13 is satisfied transitively by TASK-14; TASK-16 reports data and TASK-17 import UI are independent and do **not** block this task. Run backend auth-contract verification in parallel with frontend preparation; if it identifies a missing persisted backend/session contract, report and coordinate a separate backend correction before declaring signup acceptance met. TASK-15 final onboarding, daily-check and quarterly-reporting journeys depend on TASK-18, not vice versa.

## Technical Context

### Relevant Components and APIs

- Existing signup/login/onboarding pages, `AssetDrawer`, Reports and Settings; frontend API client, session provider/store and TanStack Query keys. Locate actual files/contracts before implementation; this task does not prescribe speculative endpoint signatures other than the known override PATCH.
- Existing owner-scoped auth, portfolio/broker/account, transaction, quote override and export APIs. Backend agent must confirm registration creates a durable user + usable cookie/session and document request/response/logout/override-clear contracts. Frontend must not silently fake persistence if verification finds a gap.

## Implementation Guidance

- Align with [design-02 six journeys](../design-docs/design-02-information-architecture-ux.md), [design-04 API](../design-docs/design-04-rest-api-contract.md), ADR-004/005/006/009/010. Use server state as truth across devices; mutation invalidation occurs only after confirmed API success. Prefer existing shared UI and Settings download rather than duplicate export code.
- **File Overlap Warning:** frontend route/auth pages and `apps/web/src/lib/api.ts` overlap TASK-06/07/14/17; `AssetDrawer` and related quote/holding cache keys overlap TASK-07/11/14; Reports overlaps TASK-12/16 integration; fixture browser files overlap TASK-15. **Merge strategy:** existing feature implementations are already landed: sequentially extend their respective auth/onboarding, asset and Reports sections without rewriting shared helpers. Run TASK-18 before TASK-15 source-independent journey tests; if simultaneous edits hit identical lines, sequence their merge. Backend verification is read-only and can run in parallel.

## Edge Cases

- **Races:** double-submit registration/onboarding, simultaneous login/logout or owner switch, late quote/portfolio requests from a previous session and StrictMode route re-entry must not create duplicates or leak cached private data.
- **Empty/missing:** no portfolio/account/broker, no first journal entry, missing symbol/title/quote/currency, nullable fields and reset of an absent override show honest fallbacks, not invented prices or positions.
- **Failures:** API validation 400, ownership 404, conflict 409, auth 401, rate limit, network timeout and storage/session expiration retain recoverable form input where safe; no success feedback after failed write or half-finished onboarding.
- **Limits:** very large/exact-cent price strings, unsupported fractional cents, zero/negative input, USD/native vs BRL, missing FX, many assets and multiple portfolios; avoid floating-point money conversion and avoid reporting a stale price as current.
- **Regressions:** previously approved Settings export, TASK-17 import, register drawer, asset read-only detail, dashboard/reports truthfulness and cross-user isolation remain functional; do not modify pre-existing tests to pass.

## Testing

### Unit and Component Tests

- [ ] Assert real mutation calls, validation, errors, session-aware cache clearing, idempotent onboarding, exact-cent override and query invalidation (not static snapshots or vacuous selectors).

### Integration and Browser Tests

- [ ] New deterministic API-fixture E2E for signup→onboarding→first entry, daily-check override write/reset and Reports→Settings export; ~30s per Playwright run. Real DB and cross-user journey acceptance remain TASK-15's scope.
- [ ] `apps/web` build/typecheck/lint/tests pass and code QA approves; report any backend contract blocker rather than implying a backend repair was delivered by this task.

## Definition of Done

- [ ] UI paths integrated with verified persisted APIs, tested and code QA-approved; unresolved backend contracts/live-DB validation documented. Task commit only after final QA per pipeline convention.

## References

- [Architecture](../../../architecture/architecture.md) · [Architecture index](../../../architecture/index.md) · [design-02](../design-docs/design-02-information-architecture-ux.md) · [design-04](../design-docs/design-04-rest-api-contract.md) · [TASK-15](TASK-15-e2e-hardening.md)
