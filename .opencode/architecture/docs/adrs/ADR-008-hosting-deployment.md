# ADR-008: Hosting and Deployment

**Status:** Accepted  
**Date:** 2026-09-04

## Context

Investy is a full-stack app (API + worker + SPA) backed by managed PostgreSQL. It is personal/family-scale now but must not preclude becoming a published product. Secrets (provider keys, DB credentials, session secret, cookie signing) must never reach the browser.

## Decision

- **API + worker**: single hostable unit on a platform-backed Node service — **Railway** or **Fly.io** (with **Render** as an alternative), deployed from CI on push to the main branch. The API serves the API surface; the worker runs alongside via the shared process entrypoint (ADR-002, ADR-007).
- **Web**: the SPA build is served by the same deployment for simplicity, or statically on **Vercel/Netlify** if splitting is preferred. In both cases it talks to the API over HTTPS.
- **PostgreSQL**: managed option — **Neon**, **Supabase**, or **Railway Postgres**. Provider choice finalized at implementation (see Open Questions in `architecture.md`).
- **Secrets**: all credentials in platform env vars; the frontend bundle contains no secrets (ADR-010).
- **Environments**: `development`, `staging`, `production` — schema migrations applied via the API/worker on deploy (versioned Drizzle migrations), never manually.
- **CORS**: API allows only the application origin(s); credentials mode for cookies.
- **Backups**: platform-level DB backups plus the worker's JSON export backup (ADR-007).

## Consequences

### Pros

- Zero self-managed servers; managed Postgres gives TLS, backups, and point-in-time recovery.
- Single deploy unit keeps CI/CD simple while the app is small.
- The chosen providers support growth to multi-user traffic without re-architecture.

### Cons

- Monthly infrastructure cost (roughly USD 5-15 at personal scale depending on providers).
- Platform lock-in (env/schedule conventions differ between Railway and Fly.io); mitigated by keeping deployment config thin and documented.
- Cold-start and free-tier limits of some platforms are avoided by choosing long-running services.

## Alternatives Considered

- **Self-hosted VPS (e.g. Hetzner/OVH)**: rejected for V1 — ops burden and manual backups vs. managed platforms.
- **Serverless functions (Vercel/Netlify Functions) for the API + worker**: rejected — cron limits and cold starts make the scheduler fragile.
- **SQLite + local hosting**: rejected — conflicts with multi-user/multi-device (ADR-004).