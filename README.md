# Investy

Investy is a multi-user investment portfolio dashboard for the Brazilian retail market. It is designed to consolidate investments held across brokers into one view of portfolio value, cost basis, diversification, dividend income, and performance over time.

The application is a full-stack, responsive web platform with authenticated accounts and server-side persistence. Its interface uses Brazilian Portuguese (`pt-BR`) and Brazilian currency and number formatting.

## Delivery Pipeline (.opencode submodule)

Investy uses the Delivery Pipeline harness through the `.opencode` Git submodule. It provides the development workflow, agents, skills, and documentation entry points.

For instructions on initializing the submodule, selecting this project's branch, configuring remote tracking, and pulling updates, see the [submodule setup guide](https://github.com/Xounder/delivery-pipeline/blob/dlvr-ppln/investy/.docs/07-submodule-install.md#cloning-a-codebase-that-contains-the-submodule). The guide also links to the required OpenCode plugin-dependency installation steps.

## Product Scope

The product's scope covers:

- **Portfolio consolidation:** Brazilian stocks, FIIs, ETFs, BDRs, cryptocurrencies, fixed income, and Tesouro Direto, including international ETF holdings.
- **Transaction-based positions:** purchases, sales, dividends, splits, and adjustments recorded in a journal, with manual entry, CSV/JSON import, and B3 brokerage-note import as input paths.
- **Portfolio analysis:** consolidated value, cost basis, unrealized gains and losses, and allocation across assets.
- **Market data:** server-side quote retrieval with caching, last-known-good fallback, and manual price overrides.
- **Income and performance:** dividend tracking and historical comparisons against CDI, IBOV, IFIX, and the S&P 500.
- **Data ownership:** account-scoped portfolios, data export, and scheduled backup workflows.

Investy focuses on portfolio tracking and analysis. Order execution, tax reporting, and native mobile applications are outside the V1 scope. See the [system architecture](.opencode/architecture/architecture.md) for the full product scope, non-goals, and success criteria.

### Development Status

The project is under active development. The scope above describes the product direction; accepted architecture decisions are not a release-completion checklist. Consult the [browser-test runbook](apps/web/e2e/real/README.md) for integration-validation requirements and outstanding runtime verification.

## Architecture at a Glance

```text
Browser (React SPA) -> Hono API -> PostgreSQL
                         |
                  Market-data providers

Scheduled worker -> PostgreSQL / market data / backups
```

| Layer | Technologies and responsibility |
| --- | --- |
| Web | React 18, Vite, TypeScript, TanStack Query, Zustand, Tailwind CSS v4, and Recharts |
| API | Node.js, Hono, zod validation, cookie-based sessions, and a server-side market-data proxy |
| Persistence | PostgreSQL with Drizzle ORM and versioned migrations |
| Worker | Separate process inside the API package for scheduled synchronization, snapshots, and backups |
| Validation | Vitest for unit/API tests and Playwright for browser journeys |
| Local runtime | Docker Compose with separate main-application and E2E environments |

Core conventions:

- The **transaction journal is the source of truth** for positions.
- Monetary amounts use **integer cents**, rather than floating-point money arithmetic.
- User-owned data is scoped to its owner and checked by the API.
- Provider credentials, database credentials, and session secrets stay on the server.
- The shared domain package has no dependencies on the web or API packages.

For the rationale and trade-offs, start with the [architecture index](.opencode/architecture/index.md) and its [Architecture Decision Records](.opencode/architecture/docs/adrs/).

## Repository Layout

```text
apps/
  web/              React dashboard and browser tests
  api/              HTTP API, persistence, market-data integration, and worker
packages/
  domain/           Shared domain types and financial calculations
docker/             Local bootstrap and E2E helpers
.opencode/          Delivery Pipeline submodule and project documentation
```

This is a pnpm workspace. Optional host-based development and static checks require Node.js 20+ and pnpm 10+; the default Docker runtime does not require a host Node.js or PostgreSQL installation.

## Run Locally

Install Docker Engine with Compose v2. From the repository root, run each command separately:

```bash
docker compose -f compose.bootstrap.yaml run --build --rm bootstrap
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up --build -d --wait
```

Open **http://localhost:8080**. The stack includes PostgreSQL, migrations, the API, worker, and web application. Bootstrap generates the ignored local settings; the detailed setup and optional provider-token configuration are documented in the [Docker guide](DOCKER.md).

Stop the local stack when finished:

```bash
docker compose -f compose.yaml stop
```

Database and backup volumes persist across stops. The local stack uses HTTP; production deployment is covered separately in the [deployment guide](DEPLOYMENT.md).

## Validation

- **Static checks and unit/API tests:** use the existing package commands listed in the [Docker guide](DOCKER.md#static-checks-without-docker-optional-host-nodepnpm).
- **Browser and PostgreSQL integration:** follow the [isolated E2E runbook](apps/web/e2e/real/README.md#docker-only-postgresql-and-playwright-preferred), which uses a separate Compose project and database.
- **Operational checks:** see the [Docker guide](DOCKER.md) for process health and database readiness, and the [deployment guide](DEPLOYMENT.md) for production configuration and backup requirements.

Real-database browser cases require the dedicated E2E environment. Skipped cases or fixture-only results do not establish PostgreSQL integration coverage.

## Documentation

| Topic | Start here |
| --- | --- |
| Project documentation and workflow navigation | [Documentation index](.opencode/INDEX.md) |
| Product scope, system design, data model, and decisions | [Architecture](.opencode/architecture/index.md) |
| Local startup, configuration, migrations, and diagnostics | [Docker guide](DOCKER.md) |
| Production deployment, health checks, and backups | [Deployment guide](DEPLOYMENT.md) |
| Isolated PostgreSQL browser validation | [E2E runbook](apps/web/e2e/real/README.md) |
| Server environment variable names | [Environment example](.env.example) |
| Contribution and agent operating rules | [AGENTS.md](AGENTS.md) |
| Commit conventions | [Commit pattern](.opencode/architecture/commit-pattern.md) |
