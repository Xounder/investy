# ADR-006: Authentication and Multi-User Isolation

**Status:** Accepted  
**Date:** 2026-09-04

## Context

Investy is multi-user from day one. Portfolio data is private and sensitive. The frontend is a stateless SPA over a JSON API; the user requested multi-device access. The security model must prevent any cross-user data access and keep session credentials out of client-side storage.

## Decision

- **Email + password authentication** with passwords hashed via a strong KDF (Argon2id).
- **Server-side sessions** stored in the database, delivered as **httpOnly, secure, SameSite cookies** — never readable by JavaScript.
- **OAuth2-ready design**: the auth layer is abstracted behind a provider interface so a future Google OAuth / Open Finance flow can be added without redesigning the session model.
- A session cookie carries only a random opaque session id; all identity data lives server-side.
- **Per-user data isolation** enforced at the repository layer: every query is scope-filtered by the authenticated user id. Tests must prove cross-user access returns empty/403.
- Session expiry and rotation, plus an explicit logout, are required; CSRF protection via SameSite cookies + origin checks.

## Consequences

### Pros

- httpOnly cookies resist XSS token theft; no tokens in localStorage.
- Server-side sessions can be revoked immediately (logout, password reset, admin action).
- The isolation boundary is centralized in one repository layer rather than scattered per route.
- OAuth2-ready seam makes future Google/Open Finance integration low-friction.

### Cons

- Session/DB lookups on each request add latency (mitigated by a short-lived in-memory session cache).
- Password-based auth requires signup/profile UX and password-reset flows in V1.
- Running a sessions table and cookie handling is more work than delegating to a third-party auth provider.

## Alternatives Considered

- **JWT in localStorage**: rejected — XSS-exposed tokens; revocation is hard.
- **Third-party auth provider only (e.g. Auth.js / Supabase Auth / Clerk)**: considered; deferred to keep the auth domain self-contained, but the provider interface allows adopting one later without redesign.
- **No auth (single user)**: rejected — user approved multi-user from day one.
- **OAuth-only login**: deferred to keep V1 scope lean; the interface makes it additive.