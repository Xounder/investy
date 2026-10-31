# Project Structure

This map shows the important versioned entry points and local artifact areas.
It describes the repository, not a claim that Docker or live validation ran.

```text
Investy/
├── AGENTS.md                       # Operational rules and conventions
├── README.md                       # Product and documentation entry point
├── package.json                    # pnpm monorepo scripts
├── pnpm-workspace.yaml             # apps/* and packages/* workspaces
├── pnpm-lock.yaml
├── tsconfig.base.json
├── .gitignore
├── .dockerignore                   # Keep private/local artifacts out of images
├── .env.example                    # Public environment-variable template
├── opencode.jsonc                  # Project settings and colon-named delivery commands
├── Dockerfile                      # Application and browser-runner images
├── compose.yaml                    # Main PostgreSQL/migrate/API/worker/web
├── compose.bootstrap.yaml          # Docker-native private configuration setup
├── compose.e2e.yaml                # Isolated test database/migrate/browser
├── DOCKER.md                       # Docker-first local operation
├── DEPLOYMENT.md                   # Deployment and validation boundaries
├── docker/                         # Bootstrap, secret guards, runner and nginx
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.ts              # Hono app, independently testable
│   │   │   ├── index.ts            # API process bootstrap
│   │   │   ├── db/                 # Drizzle client and schema modules
│   │   │   ├── lib/
│   │   │   ├── middleware/
│   │   │   ├── repositories/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── worker/             # Separate process, scheduler and jobs
│   │   ├── drizzle/                # Versioned SQL migrations and metadata
│   │   ├── tests/                  # Domain-boundary/API regression tests
│   │   └── test-support/           # Real-E2E launcher/provider fixtures/helpers
│   └── web/
│       ├── src/                    # React pages, components, clients and state
│       ├── e2e/                    # Browser fixtures and bundle security scan
│       │   └── real/               # PostgreSQL journeys, helpers and runbook
│       ├── playwright.config.ts
│       ├── vite.config.ts
│       └── vite.real.config.ts     # Test-only same-origin API proxy
├── packages/
│   └── domain/
│       ├── src/                    # Pure journal, money, FX and rateio math
│       └── tests/
├── .data/                          # Local data/test artifacts, Git-ignored
│
└── .opencode/                      # Agent configuration and workflow docs
    ├── INDEX.md                    # Central documentation navigation
    ├── docs-catalog.md             # Operational Markdown catalog
    ├── project-structure.md        # This map
    ├── OPENCODE_PLUGINS.md         # Plugin development guide
    ├── pipeline.yaml               # Canonical execution state; already tracked
    ├── .gitignore                  # Keeps plan private except versioned batch handoffs
    ├── package.json                # Standalone OpenCode/npm test package
    ├── package-lock.json           # npm tooling dependency lock
    ├── pnpm-workspace.yaml         # Existing tooling installation metadata
    ├── pnpm-lock.yaml              # Existing tooling installation metadata
    ├── agents/
    │   ├── 00-architecture-initializer.md
    │   ├── 00-planning-agent.md
    │   ├── 01-solution-designer.md
    │   ├── 02-tech-lead.md
    │   ├── 03-senior-frontend.md
    │   ├── 04-senior-backend.md
    │   ├── 05-qa-reviewer.md
    │   └── shared/                 # Implementation and subagent rules
    ├── architecture/
    │   ├── index.md
    │   ├── architecture.md
    │   ├── architecture-folder-schema.md
    │   ├── commit-pattern.md
    │   ├── references/
    │   └── docs/
    │       ├── adrs/               # ADR-001 through ADR-011
    │       ├── backend/
    │       ├── feature/
    │       └── frontend/
    ├── commands/
    │   ├── delivery-pipeline-new.md
    │   ├── delivery-pipeline-resume.md
    │   ├── doc-audit.md
    │   └── learning-improvement.md  # Colon command aliases configured at root
    ├── skills/
    │   ├── delivery-pipeline/      # SKILL.md, session-batches.md and phase/recovery references
    │   ├── workflow-router/
    │   ├── learning-improvement/   # Evaluation; first STOP-chain skill
    │   ├── continuous-learning/    # Approved documentation improvements
    │   ├── session-save/           # Last STOP-chain skill
    │   ├── doc-audit/
    │   └── codebase-analysis/
    │       ├── SKILL.md
    │       ├── scripts/            # scan.mjs and parser dependencies
    │       └── output/             # Generated local reports, Git-ignored
    ├── template/                  # Artifact templates, batch-handoff-template.md, variables
    ├── plan/
    │   └── <context>/
    │       ├── design-docs/
    │       ├── planning/
    │       ├── tasks/
    │       └── references/         # Archived history + durable batch-BATCH-XX-handoff.md
    ├── plugins/
    │   ├── context-budget.plugin.ts # Register the host SDK client; no duplicate tool
    │   ├── code-validator.plugin.ts
    │   ├── secure-access.plugin.ts
    │   ├── secure-access.test.ts
    │   ├── session-load-autoloader.plugin.ts
    │   └── sound-alert.plugin.ts
    ├── context-budget.json         # Auto ratios/caps and exact-model capacity overrides
    ├── lib/
    │   ├── context-budget-client.ts # Scoped host client and disposal
    │   └── context-budget.ts       # Model capacity, effective limits and snapshot freshness
    ├── tests/
    │   ├── context-budget-config.test.ts # Budget config and boundaries
    │   ├── context-budget-host.test.ts # Real SDK transport regressions
    │   ├── context-budget-manual-host.test.ts # SDK metadata failure/manual override regressions
    │   ├── context-budget-invalid-tool.test.ts # Invalid policy fails closed
    │   └── read-context-budget.test.ts # Tool/helper regression tests
    ├── sessions/                  # Local saved evaluations, Git-ignored
    ├── tools/                     # Folder/diff/state/template/validation/save
    │   └── read-context-budget.ts  # Caller-session context snapshot tool
    └── node_modules/              # Installed tooling dependencies, ignored
```

## Validation Entry Points

- Application packages are pnpm workspaces: `apps/web`, `apps/api`, and
  `packages/domain`. Agents use `run-package-command` for their standard checks.
- The standalone `.opencode` test package has an npm lockfile and npm-installed
  tooling. From the repository root, run `npm --prefix .opencode test`.
  Do not route this installation through the application workspace's pnpm
  validator: it can trigger dependency reinstallation instead of the test script.
- Generated scanner reports and saved session evaluations stay local. Their
  existence does not mean a pipeline task or a runtime validation completed.
- `pipeline.yaml` carries compact session-batch pointers; detailed handoffs
  live in versioned `plan/<context>/references/`, not the two retained sessions.
  A batch checkpoint is not evidence of deferred Docker/runtime acceptance.

## Runtime Guides

- [Docker-first main stack](../DOCKER.md)
- [Deployment boundaries](../DEPLOYMENT.md)
- [Isolated real-PostgreSQL browser suite](../apps/web/e2e/real/README.md)

Keep code-QA, static checks, fixture-based browsers, and real database/worker
validation distinct. Consult `pipeline.yaml` for the current blockers and task
commit SHAs, and `plan/<context>/references/` for archived execution history.
