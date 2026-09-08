# ADR-002: Monorepo Structure

**Status:** Accepted  
**Date:** 2026-09-04

## Context

Investy has three runtime concerns with significant shared logic: the SPA, the HTTP API + market-data proxy, and the scheduled worker. Portfolio calculations (positions, P&L, diversification), domain types, and BRL/currency formatting are shared across all of them. The repository was initialized as a pnpm workspace by the pipeline conventions.

## Decision

Organize the repository as a pnpm monorepo:

```text
Investy/
├── apps/
│   ├── web/        # React + Vite SPA
│   └── api/        # Hono API, market-data proxy, and the worker entrypoint
└── packages/
    └── domain/     # Shared types, portfolio math, formatting, invariant checks
```

- The **worker** runs as a separate process entrypoint inside `apps/api` (e.g. `npm run start:worker`), reusing the same schema, repositories, and domain package so it stays a single deploy unit.
- `packages/domain` is dependency-free (pure TypeScript), so the frontend, API, and worker share the same calculation logic without duplication.
- Package boundaries: `web` and the worker may depend on `domain` and the API client; `api` depends on `domain`; `domain` depends on nothing internal.

## Consequences

### Pros

- Single source of truth for position/P&L math across all processes — the highest-risk logic of the product is implemented once.
- Clear dependency direction enforced by boundary rules; easy to test `domain` in isolation.
- One deploy unit for api+worker simplifies hosting and CI.
- Aligns with the existing pnpm workspace conventions in the repository.

### Cons

- Requires disciplined dependency rules to avoid `web` importing backend internals.
- Monorepo tooling (workspace tasks, shared TS configs) adds a small setup overhead.

## Alternatives Considered

- **Worker as a separate `apps/worker` package**: rejected — shares nearly all code with `apps/api`; a separate package would duplicate build/config and complicate deployment.
- **Single non-monorepo package**: rejected — shared domain math would be entangled with HTTP concerns and hard to test independently.
- **npm workspaces instead of pnpm**: rejected — pnpm is already the repository convention.