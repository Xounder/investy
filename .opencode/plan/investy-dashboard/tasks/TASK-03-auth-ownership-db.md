# Task Template

## Task Information

### ID

TASK-03

### Title

Authentication, Ownership, and Database Schema (M2)

### Owner

senior-backend

### Status

Pending

---

## Description

Implement authentication (email/password with Argon2id hashing), session management (httpOnly cookie sessions), and the complete Postgres database schema via Drizzle ORM. Create the ownership-scoped repository layer that enforces per-user data isolation on every query. Implement rate limiting foundation for API routes. Build the onboarding API endpoint. The database schema covers all V1 entities: User, Portfolio, Broker, Account, Asset, Transaction, Dividend, Quote, QuoteOverride, Holding (materialized), PortfolioSnapshot, BenchmarkSeries, NotaImport. Auth middleware extracts session user and attaches to Hono context. All user-owned routes use scoped repositories that filter by owner.

---

## Acceptance Criteria

- [ ] Postgres schema via Drizzle covers all V1 entities (User, Portfolio, Broker, Account, Asset, Transaction, Dividend, Quote, QuoteOverride, Holding, PortfolioSnapshot, BenchmarkSeries, NotaImport) with correct types, relations, and indexes
- [ ] Drizzle migrations generate and apply cleanly
- [ ] `POST /auth/register` — creates user with Argon2id password hash; returns user object (no password)
- [ ] `POST /auth/login` — validates credentials; sets httpOnly session cookie; returns user object
- [ ] `POST /auth/logout` — clears session cookie
- [ ] `GET /auth/me` — returns current user from session cookie (or 401)
- [ ] `POST /auth/password-reset/request` — accepts email; returns 202 (token generation can be stubbed)
- [ ] `POST /auth/password-reset/confirm` — accepts token + password; updates hash
- [ ] `POST /onboarding` — creates default portfolio + optional broker + optional first holding; returns 201
- [ ] Session middleware: extracts user from httpOnly cookie, attaches to Hono context
- [ ] Ownership-scoped repositories: every user-owned query filters by session userId
- [ ] Rate limiting middleware on auth routes (brute-force protection)
- [ ] Cross-user access returns 404 (not 403) to prevent enumeration
- [ ] All tests pass; build/typecheck/lint clean

---

## Dependencies

### Required Tasks

- TASK-01
- TASK-02

### Dependency Notes

Requires TASK-01 for monorepo/Drizzle setup and TASK-02 for domain types (TransactionType, AssetClass, etc.) used in the schema.

---

## Technical Context

### Relevant Components

- `apps/api/src/db/schema.ts` — Drizzle schema (all tables)
- `apps/api/src/db/migrate.ts` — migration runner
- `apps/api/src/middleware/auth.ts` — session extraction middleware
- `apps/api/src/middleware/rate-limit.ts` — rate limiting
- `apps/api/src/routes/auth.ts` — auth routes
- `apps/api/src/routes/onboarding.ts` — onboarding route
- `apps/api/src/repositories/` — scoped repository layer
- `apps/api/src/lib/session.ts` — session management (cookie signing/verification)

### Relevant Modules

- Auth & Onboarding module (M1 in design-01)
- Multi-user isolation (ADR-006)
- Database schema (ADR-004)

### Relevant APIs

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /onboarding`

### Relevant Types

- `User` (id, email, passwordHash, name, createdAt)
- `Session` (userId, token, expiresAt)
- `Portfolio`, `Broker`, `Account`, `Asset`, `Transaction`, `Dividend`, `Quote`, `QuoteOverride`, `Holding`, `PortfolioSnapshot`, `BenchmarkSeries`, `NotaImport` (from design-03)

---

## Implementation Guidance

### Expected Changes

- Implement full Drizzle schema in `apps/api/src/db/schema.ts` with all V1 tables
- Generate and apply migrations
- Implement `apps/api/src/lib/session.ts` (cookie signing, verification, creation)
- Implement `apps/api/src/middleware/auth.ts` (session extraction, Hono middleware)
- Implement `apps/api/src/middleware/rate-limit.ts` (sliding window or token bucket)
- Implement `apps/api/src/routes/auth.ts` (register, login, logout, me, password-reset)
- Implement `apps/api/src/routes/onboarding.ts` (default portfolio + broker + first entry)
- Implement `apps/api/src/repositories/` base layer with ownership scoping
- Seed Broker catalog (XP, Rico, Clear, NuInvest, Inter + custom)

### Constraints

- Argon2id for password hashing (ADR-006)
- httpOnly cookie sessions; no localStorage tokens (ADR-006/010)
- CORS locked to app origin; credentials include (ADR-010)
- Cross-user access returns 404 (not 403) (design-04)
- All money fields in schema use BIGINT integer cents (ADR-004)
- UTC timestamps; America/Sao_Paulo applied at presentation
- zod validation on all route inputs (ADR-010)
- Rate limiting on auth routes (ADR-010)

### Validation Rules

- Register rejects duplicate email (409)
- Login rejects invalid credentials (401)
- Session cookie is httpOnly, secure, sameSite=lax
- All user-owned queries include `WHERE userId = ?` at repository layer
- Drizzle migrations apply cleanly to a fresh Postgres database

---

## Edge Cases

- Register with already-taken email — must return 409, not leak existing user info
- Login with wrong password — generic error message (no "user not found" vs "wrong password" distinction)
- Expired session cookie — returns 401; client must re-authenticate
- Missing DATABASE_URL — API fails gracefully on startup
- Broker seed idempotency — seeding must not fail on re-run (upsert)
- Onboarding with invalid brokerId — returns 400 with clear error
- Concurrent session creation — no race conditions on session table
- Password reset token expiry — must reject expired tokens
- Very long email addresses — validate with zod email schema (max 255 chars)
- SQL injection via repository layer — Drizzle parameterizes queries

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/api/src/db/schema.ts` — also TASK-04 (adds Quote/Asset/BenchmarkSeries), TASK-05 (route reads), TASK-10 (worker reads). **Merge strategy: sequential** — this task creates the schema; later tasks only add tables/consumers. Do not reformat existing table definitions.
- `apps/api/src/index.ts` — also TASK-04, TASK-05, TASK-13 (each registers its own route module). **Merge strategy: sequential preferred**; if parallelized, merge at the route-registration block only (module-level routes per resource).
- `apps/api/src/middleware/auth.ts` — also TASK-05, TASK-13 (consumers). **Merge strategy: parallel with careful merge** — later tasks import only; never modify middleware internals.
- `apps/api/src/repositories/base.ts` — also TASK-05, TASK-13 (extend with entity repositories). **Merge strategy: parallel with careful merge** — later tasks add new repository files; never modify the base class.

---

## Testing

### Unit Tests

- [ ] Session creation/verification round-trip
- [ ] Rate limiter increments and blocks after threshold
- [ ] Password hash/verify with Argon2id
- [ ] Ownership scope filter applied to repository queries

### Integration Tests

- [ ] Register → login → /me returns user
- [ ] Register → login → /me with expired session returns 401
- [ ] Register duplicate email returns 409
- [ ] Login with wrong password returns 401
- [ ] Onboarding creates portfolio + broker + optional holding
- [ ] Cross-user access to another user's portfolio returns 404
- [ ] Drizzle migration applies cleanly to fresh DB

### Manual Validation

- [ ] Run `pnpm build` in `apps/api` — builds cleanly
- [ ] Run `pnpm test` in `apps/api` — all tests pass
- [ ] Test auth flow manually: register, login, check /me, logout

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

- ADR-004: Postgres + Drizzle + integer cents
- ADR-005: Transaction journal
- ADR-006: Auth + multi-user isolation
- ADR-010: Security foundation
- design-03: Entities and ownership model
- design-04: Auth endpoints
- design-07: M2 Auth + ownership milestone (3 dev-days)
