# Task Template

## Task Information

### ID

TASK-15

### Title

E2E Testing, Isolation Tests, Security Pass, and Deploy Config (M9)

### Owner

senior-frontend

### Status

Pending

---

## Description

Implement end-to-end Playwright tests covering the six key user journeys (design-02), cross-user isolation tests, security hardening pass, and deployment configuration. Playwright journeys: (1) Onboarding — signup → default portfolio → broker → first entry → dashboard; (2) Daily check — dashboard KPIs → holdings → asset detail → price override; (3) Adding/selling — register drawer → fill form → submit → holdings update; (4) Nota day — import → upload → preview → confirm → journal grows; (5) Dividend month — agenda → confirm pay date → income view; (6) Quarterly reporting — reports → performance chart → export. Security pass: secret scan (no secrets in frontend bundle), CORS verification, rate limit verification, XSS checks, SQL injection checks. Deploy config: environment variables documented, health check endpoint verified, production build tested.

---

## Acceptance Criteria

- [ ] Playwright E2E: Onboarding journey (signup → portfolio → broker → first entry → dashboard)
- [ ] Playwright E2E: Daily check journey (dashboard → holdings → asset detail → price override)
- [ ] Playwright E2E: Adding/selling journey (register drawer → fill → submit → holdings update)
- [ ] Playwright E2E: Nota day journey (import → upload → preview → confirm → journal grows)
- [ ] Playwright E2E: Dividend month journey (agenda → confirm pay date → income view)
- [ ] Playwright E2E: Quarterly reporting journey (reports → performance chart → export)
- [ ] Isolation test: user A creates data → user B cannot see it
- [ ] Isolation test: API returns 404 for cross-user resource access
- [ ] Security: no API keys or secrets in frontend bundle
- [ ] Security: CORS headers verified (only app origin allowed)
- [ ] Security: rate limiting verified on auth endpoints
- [ ] Security: SQL injection attempts rejected by zod validation
- [ ] Security: XSS attempts sanitized in UI
- [ ] Deploy config: `.env.example` with all required environment variables
- [ ] Deploy config: production build succeeds (`pnpm build` all packages)
- [ ] Deploy config: health check endpoint responds correctly
- [ ] All Playwright tests pass
- [ ] All unit/integration tests pass
- [ ] Build/lint/typecheck clean across all packages

---

## Dependencies

### Required Tasks

- TASK-07
- TASK-08
- TASK-09
- TASK-10
- TASK-11
- TASK-12
- TASK-14
- TASK-16
- TASK-17
- TASK-18
- TASK-19

### Dependency Notes

Requires the feature tasks (TASK-07..12, TASK-14), canonical reports API (TASK-16), operative import UI (TASK-17), approved journey integration (TASK-18), and TASK-19's isolated Docker PostgreSQL/bootstrap path for final **real-DB** six-journey execution. TASK-15's scaffold is already code QA-approved; TASK-19 consumes that existing scaffold but must not depend on TASK-15's full completion (no cycle). Fixture passes or skipped real cases are not real-DB proof. TASK-08 remains the import API prerequisite; TASK-13 (export API) is exercised through TASK-14. TASK-12 does not retroactively depend on TASK-16. TASK-03 auth/session backend code is now QA-approved; live PostgreSQL, Docker runtime and remaining provider/worker validation must not be marked passed without execution. TASK-10 official B3 January 9/Bora worker 2026 sources and 365-day/14-closure/247-session targeted tests are recorded, with final full-package/calendar QA still pending.

---

## Technical Context

### Relevant Components

- `apps/web/tests/e2e/` — Playwright test files
- `apps/web/playwright.config.ts` — Playwright configuration
- `apps/web/tests/e2e/journeys/` — journey test files
- `apps/web/tests/e2e/isolation/` — cross-user isolation tests
- `apps/web/tests/e2e/security/` — security verification tests
- `.env.example` — environment variable documentation

### Relevant Modules

- All 9 V1 modules (M1–M9)
- Security foundation (ADR-010)
- Deployment (ADR-008)

### Relevant APIs

- All V1 endpoints (tested via E2E)
- `GET /api/health` (health check verification)

### Relevant Types

- N/A (testing task)

---

## Implementation Guidance

### Expected Changes

- Create `apps/web/tests/e2e/journeys/` with 6 journey test files
- Create `apps/web/tests/e2e/isolation/` with cross-user isolation tests
- Create `apps/web/tests/e2e/security/` with security verification tests
- Configure Playwright for the test environment
- Create `.env.example` with all required environment variables
- Verify production build succeeds
- Run secret scan (no secrets in bundle)

### Constraints

- E2E tests run against a real database (test database, not mock)
- Each journey test is independent (clean state per test)
- Isolation tests use two separate user sessions
- Security tests verify actual security properties, not just absence of known vulnerabilities
- Playwright runs cost ~30s per run — batch journeys sensibly (design note)
- Tests must not modify application source code
- Existing tests must not be modified

### Validation Rules

- All 6 journey tests pass
- Isolation tests confirm cross-user access is blocked
- Security tests confirm no secrets in bundle
- Security tests confirm CORS headers
- Security tests confirm rate limiting
- Production build succeeds
- Health check responds correctly

---

## Edge Cases

- Test database not available — tests skip gracefully or fail with clear message
- Flaky tests (race conditions in async flows) — use proper waits/retries
- Nota import test depends on sample PDF/text/CSV fixture — include fixture in repo
- Dividend test depends on provider data — mock or seed test data
- Very slow E2E tests — optimize selectors and waits
- Test cleanup between runs — beforeAll/afterAll hooks reset state
- Browser differences — Chromium primary; verify Firefox/WebKit
- CI headless execution — tests must run headless
- Missing test fixtures — create minimal deterministic test data
- Concurrent test runs — unique per-run data to avoid collisions
- API provider rate limits during E2E — stub external providers; seed quotes

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/web/playwright.config.ts` — also TASK-01 (creates base config). **Merge strategy: sequential** — this task extends the config with journey/isolation/security test projects; never modify base settings created by TASK-01.

---

## Testing

### Unit Tests

- [ ] None in this task (testing task)

### Integration Tests

- [ ] None in this task (testing task)

### Manual Validation

- [ ] All Playwright tests pass
- [ ] Security scan clean
- [ ] Production build succeeds
- [ ] Health check responds
- [ ] Deploy config documented

---

## Definition of Done

- [ ] Implementation completed
- [ ] Acceptance criteria satisfied
- [ ] Tests created or updated
- [ ] Build passes (all packages)
- [ ] Lint passes
- [ ] Validation completed (Playwright + security + deploy)

---

## References

- ADR-010: Security foundation
- ADR-008: Hosting/deployment
- design-02: Key user journeys
- design-07: M9 E2E + hardening milestone (3–4 dev-days)
