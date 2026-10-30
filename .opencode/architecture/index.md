# Investy — Architecture Index

## Overview

Investy is a multi-user investment portfolio dashboard for the Brazilian retail market. This index is the single entry point for all architecture documentation under `architecture/`.

## Document List

| Document | Content |
|----------|---------|
| `architecture.md` | System architecture, principles, stack, key decisions, success criteria |
| `architecture-folder-schema.md` | Purpose of every folder inside `architecture/` |
| `commit-pattern.md` | Commit message convention |
| `docs/adrs/` | Architecture Decision Records (ADR-001 to ADR-011) |
| `docs/backend/` | Backend/API documentation (planned) |
| `docs/feature/` | Feature-level architecture (planned) |
| `docs/frontend/` | Frontend/UI component architecture (planned) |
| `references/` | Reference files extracted from oversized docs |

## Decision (ADR) Summary

| # | Decision | Status |
|---|----------|--------|
| ADR-001 | Full-stack Option C architecture (SPA + API + Postgres + auth + worker) | Accepted |
| ADR-002 | pnpm monorepo: `apps/web`, `apps/api`, `packages/domain`; worker inside `apps/api` | Accepted |
| ADR-003 | Server-side market-data proxy with provider interface + cache + manual override | Accepted |
| ADR-004 | Managed PostgreSQL as system of record via Drizzle; money in integer cents | Accepted |
| ADR-005 | Transaction journal is source of truth; B3 nota de corretagem import in V1 | Accepted |
| ADR-006 | Email/password + httpOnly cookie sessions; per-user data isolation | Accepted |
| ADR-007 | Scheduled sync worker: quotes, daily snapshots, dividend agenda, backups | Accepted |
| ADR-008 | Platform-hosted api+worker with managed Postgres; no secrets in frontend | Accepted |
| ADR-009 | Tailwind v4 theme on DocuForge tokens + Recharts; data-dense dashboard UI | Accepted |
| ADR-010 | Security foundation: server-side secrets, CORS lockdown, rate limits, zod | Accepted |
| [ADR-011](docs/adrs/ADR-011-docker-first-runtime.md) | Docker-first principal PostgreSQL/API/worker/web and isolated real-DB E2E; managed deploy option retained | Accepted |

## Reference Mapping

| Topic | Location |
|-------|----------|
| System architecture | `architecture.md` |
| Data model | `architecture.md` (Domain Data Model) and `docs/backend/` (planned) |
| API specification | `docs/backend/api-specification.md` (planned) |
| Frontend architecture | `docs/frontend/component-architecture.md` (planned) |
| Design system | `docs/design-system.md` (planned) |
| Feature catalog | `docs/feature/` (planned) |
| Commit convention | `commit-pattern.md` |
| Project documentation hub | `.opencode/INDEX.md` |
