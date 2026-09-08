# Task Template

## Task Information

### ID

TASK-01

### Title

Monorepo Foundation, Domain Skeleton, CI, and Test Harness (M0)

### Owner

senior-backend

### Status

Pending

---

## Description

Scaffold the entire pnpm monorepo for Investy from scratch (greenfield — no source code exists yet). Create the project structure per ADR-002: `apps/web` (React 18 + Vite + TypeScript SPA), `apps/api` (Node + Hono + TypeScript), `packages/domain` (pure TypeScript, zero external dependencies). Wire the shared toolchain: TypeScript config, ESLint, Prettier, Vitest test harness, Playwright harness, and a root `package.json` with workspace scripts. Create the Postgres schema skeleton via Drizzle ORM in `apps/api` (migration tooling, connection config from env vars). Create the domain package skeleton with placeholder exports for JournalEngine, Money helpers, Fx helpers, and Rateio allocator. Wire CI-ready build/test scripts via `run-package-command` (build, lint, typecheck, test). Verify all packages build and type-check cleanly.

---

## Acceptance Criteria

- [ ] pnpm workspace root with `apps/web`, `apps/api`, `packages/domain` directories, each with `package.json` and `tsconfig.json`
- [ ] `apps/web`: Vite + React 18 + TypeScript scaffold; `pnpm dev` starts dev server; empty App component renders
- [ ] `apps/api`: Hono server scaffold; health-check endpoint (`GET /api/health` → 200)
- [ ] `packages/domain`: pure TypeScript package; exports placeholder modules (`journal-engine.ts`, `money.ts`, `fx.ts`, `rateio.ts`) with stub types
- [ ] Drizzle ORM configured in `apps/api` with Postgres connection via `DATABASE_URL` env var; migration directory initialized
- [ ] Vitest configured in all three packages; `pnpm test` passes with zero tests (harness is wired)
- [ ] Playwright configured in `apps/web` for E2E; `pnpm test:e2e` wires correctly
- [ ] Root scripts: `build`, `lint`, `typecheck`, `test` that delegate to each package
- [ ] All packages pass `build`, `lint`, `typecheck` with zero errors
- [ ] `.gitignore` covers `node_modules`, `dist`, `.env`, `test-results`

---

## Dependencies

### Required Tasks

- None

### Dependency Notes

This is the first task. All other tasks depend on this foundation.

---

## Technical Context

### Relevant Components

- pnpm workspace root
- `apps/web` (Vite + React)
- `apps/api` (Hono)
- `packages/domain` (pure TS)

### Relevant Modules

- Monorepo structure (ADR-002)
- Domain skeleton
- CI wiring

### Relevant APIs

- `GET /api/health` (scaffold only)

### Relevant Types

- Domain placeholder types (JournalEntry, Money, FxRate, RateioAllocation)

---

## Implementation Guidance

### Expected Changes

- Create root `package.json` (pnpm workspace), `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create `apps/web/` with Vite, React 18, TypeScript, Tailwind CSS v4, index.html, src/main.tsx, src/App.tsx
- Create `apps/api/` with Hono, TypeScript, src/index.ts (health endpoint), drizzle.config.ts, src/db/schema.ts (empty), src/db/migrate.ts
- Create `packages/domain/` with src/journal-engine.ts, src/money.ts, src/fx.ts, src/rateio.ts (stub exports)
- Configure Vitest in each package; add placeholder test files
- Configure Playwright in apps/web
- Add root scripts for build/lint/typecheck/test
- Add `.gitignore`

### Constraints

- `packages/domain` must have ZERO external dependencies (ADR-002)
- TypeScript strict mode across all packages
- Vite for frontend bundling; no CRA
- Hono for API (not Express) per ADR-001/002
- Drizzle ORM for Postgres (not Prisma) per ADR-004
- pnpm as package manager (not npm/yarn)

### Validation Rules

- `pnpm build` passes for all three packages
- `pnpm typecheck` passes with zero errors
- `pnpm lint` passes with zero errors
- `pnpm test` runs Vitest in all packages (zero tests, harness valid)

---

## Edge Cases

- Empty `packages/domain` — must export types without runtime errors even with stub implementations
- Missing `DATABASE_URL` env var — API should fail gracefully on startup (not crash the build)
- Node version mismatch — pin engine requirements in root package.json
- pnpm version compatibility — lock pnpm version via `packageManager` field
- Windows vs Linux path handling — use forward slashes in configs
- Turborepo vs plain pnpm scripts — keep it simple (plain pnpm scripts per ADR-002)

---

## Testing

### Unit Tests

- [ ] Placeholder test in `packages/domain` that verifies module exports exist
- [ ] Placeholder test in `apps/api` that verifies health endpoint returns 200

### Integration Tests

- [ ] None in this task (foundation only)

### Manual Validation

- [ ] `pnpm dev` in `apps/web` renders empty React app in browser
- [ ] `pnpm dev` in `apps/api` responds to `curl localhost:3000/api/health`
- [ ] All three packages build, lint, and typecheck cleanly

---

## Definition of Done

- [ ] Implementation completed
- [ ] Acceptance criteria satisfied
- [ ] Tests created or updated
- [ ] Build passes (`pnpm build` all packages)
- [ ] Lint passes (`pnpm lint`)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Validation completed (manual smoke test)

---

## References

- ADR-001: Full-stack Option C architecture
- ADR-002: pnpm monorepo structure
- ADR-004: Postgres + Drizzle
- ADR-009: Tailwind v4 theme
- design-07: M0 Foundation milestone (3 dev-days)
