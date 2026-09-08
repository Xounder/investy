# ADR-010: Security Foundation

**Status:** Accepted  
**Date:** 2026-09-04

## Context

Investy holds private financial data, talks to external market-data providers using API keys, and runs a full-stack deployment with a persistent database and a scheduled worker. A security incident (key leak, cross-user read, injection) would be severe for a personal-finance product. The architecture decisions (ADR-003, ADR-006, ADR-008) each assume a coherent security posture.

## Decision

- **No secrets in the frontend**: provider keys, DB credentials, cookie-signing and session secrets, and admin credentials live exclusively in server environment variables. The SPA bundle must never contain any of them. Verified in CI (grep/secret-scanning).
- **Server-side market data**: all third-party calls go through `apps/api`; the browser never talks to providers directly (ADR-003).
- **CORS lockdown**: requests to the API are limited to the application origin(s); `credentials: include` for cookie auth.
- **Sessions**: httpOnly, Secure, SameSite cookies; opaque server-side session ids; rotation on login; explicit revocation (ADR-006).
- **Input validation**: every API route validates input with **zod**; import parsers sanitize/validate before persisting (ADR-005).
- **Injection prevention**: Drizzle/parameterized queries exclusively; no raw string SQL in application code.
- **Rate limiting**: per-user and per-route throttling on the API, plus provider-quota budgeting in the proxy (ADR-003).
- **HTTPS everywhere**: enforced at the platform edge (TLS termination by hosting platform).
- **DB access**: managed Postgres with least-privilege credentials; no public network exposure beyond the app.
- **Backups**: platform DB backups + scheduled JSON export (ADR-007), with restore verification.

## Consequences

### Pros

- Attack surface is minimized: keys not in browser, signed cookies, parameterized access, validation at every boundary.
- Financial-data privacy is protected by the per-user isolation enforced at the repository layer and verified by tests.
- Security posture is consistent across API, worker, and deployment.

### Cons

- Rate limiting and validation add implementation overhead on every route.
- Session management (rotation, revocation) adds small complexity over a naively stateless token approach.
- Security scanning in CI requires configuration (secret scanning on push).

## Alternatives Considered

- **Public API keys in the frontend**: rejected — would leak access and expose quotas/abuse.
- **JWT-in-localStorage sessions**: rejected — XSS-exposed; harder to revoke (see ADR-006).
- **Raw SQL / minimal validation for speed**: rejected — unacceptable for financial data.
- **No rate limiting in V1**: rejected — provider proxies and auth endpoints need protection even at personal scale.