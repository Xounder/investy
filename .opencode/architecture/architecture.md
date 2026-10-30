# Investy Architecture

## Overview

Investy is a multi-user investment portfolio dashboard for the Brazilian retail market, inspired by Investidor10's Gerenciador de Carteiras, Organizze, and the B3 portfolio-consolidation guidance.

Users consolidate holdings from multiple brokers across asset classes — ações, FIIs, ETFs (nacionais, americanos, irlandeses), BDRs, criptomoedas, renda fixa and Tesouro Direto — and get a live, consolidated view of portfolio value, cost basis, unrealized P&L, diversification, dividend income and performance over time, benchmarked against CDI, IBOV, IFIX and S&P 500.

Market data is consumed from public providers (brapi.dev, BCB SGS, Yahoo Finance, CoinGecko) through a server-side proxy that caches quotes and degrades gracefully. The UI follows the DocuForge design system extended into a data-dense, chart-driven dashboard language.

Investy is a full-stack application (Option C): React SPA + Node API + PostgreSQL + scheduled sync worker, with multi-user authentication and multi-device support from day one. [ADR-011](docs/adrs/ADR-011-docker-first-runtime.md) makes Docker Compose the default main-stack and isolated E2E bootstrap, including the principal PostgreSQL database; [ADR-008](docs/adrs/ADR-008-hosting-deployment.md) preserves the managed deployment option.

---

# Core Principles

## Transaction Journal Is the Source of Truth

Every position is derived from the transaction journal (buy, sell, dividend, split, manual adjustment). Manual holding entry and CSV/JSON import are supported input paths that always produce journal entries. No position state exists outside the journal.

## User Data Ownership

Users own their data. The system must provide full export (JSON/CSV) and automated backups. Public market data is shared; user portfolio data is never shared across accounts.

## Multi-User Isolation

The application is multi-user from day one. Every record (portfolio, holding, transaction, dividend, quote override) is scoped to an owner. The API enforces ownership filtering on every query; cross-user access is forbidden and tested.

## Provider-Agnostic Market Data

Market prices are consumed through a provider interface with caching, so neither UI nor domain logic depends on a specific vendor. Manual price overrides and last-known-good values keep the dashboard correct when a provider is down or lacks coverage.

## No Secrets in the Browser

Provider API keys, database credentials, and session secrets live only on the server. The frontend never receives secrets. Server-to-server calls are restricted; CORS is locked to the application origin.

## Design System with a Dashboard Language

The UI is rooted in the DocuForge design tokens (palette, typography, spacing) and deliberately extended beyond a documentation look into a data-dense dashboard language: sidebar navigation, cards, chips, tables, KPI bands, and charts.

## Multi-Device from Day One

All mutable state is server-side; the SPA is stateless. Users can log in from any device and see identical data, with daily performance snapshots stored in the database.

---

# High-Level Architecture

```text
┌────────────────────────────────────┐
│  Browser — React SPA (apps/web)    │
│  Vite · TanStack Query · Tailwind  │
└────────────────┬───────────────────┘
                 │ HTTPS + JSON
┌────────────────▼───────────────────┐
│  apps/api (Node · Hono)            │
│  auth · REST · market-data proxy   │
│  + cache · import/export           │
└────────────────┬───────────────────┘
                 │ Drizzle ORM
┌────────────────▼───────────────────┐
│  PostgreSQL (Docker default;       │
│  managed deployment optional)      │
│  users · journal · positions ·     │
│  dividends · quotes · snapshots    │
└────────────────▲───────────────────┘
                 │ scheduled jobs
┌────────────────┴───────────────────┐
│  Worker process (apps/api worker)  │
│  quote refresh · daily snapshot    │
│  dividend agenda · backups         │
└────────────────┬───────────────────┘
                 │ provider clients
  brapi.dev · BCB SGS · Yahoo · CoinGecko
```

---

# Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React 18 + Vite + TypeScript | Mature ecosystem, fast dev loop, data-dense UI fits |
| Frontend state | TanStack Query + Zustand | Server cache vs. transient UI state separation |
| Styling | Tailwind CSS v4 theme on DocuForge tokens | Token-driven design system, low overhead |
| Charts | Recharts | Declarative, themeable, covers line/area/donut/bar |
| Backend | Node.js + Hono + TypeScript | Light, TS-first HTTP layer for API + proxy |
| Validation | zod | Runtime validation at API and import boundaries |
| Storage | PostgreSQL (Docker default; managed option) + Drizzle ORM | Multi-user OLTP, transactional journal, versioned migrations |
| Auth | Email/password + httpOnly cookie sessions, OAuth2-ready | Secure defaults, extensible to Google/Open Finance |
| Market data | brapi.dev (B3/FII/ETF/BDR/crypto + indicators), BCB SGS (Selic/CDI/IPCA), Yahoo chart (US/IE), CoinGecko (crypto fallback) | Redundancy + official macro source, server-side caching |
| Worker | Node process in `apps/api`, scheduler (node-cron / platform cron) | Shares schema and domain code, single deploy unit |
| Hosting | Compose main stack and isolated E2E by default; deployable images may use managed Postgres and hosted TLS/storage | Docker-first bootstrap with portable hosting; production TLS/off-host backups must be supplied separately (ADR-011) |
| Tests | Vitest (unit/domain/API) + Playwright (E2E) | Correctness of money math and key flows |
| Money | Integer cents (BIGINT), BR formatting via Intl | No floating-point drift on BRL arithmetic |

---

# Key Decisions

| # | Decision | Status | ADR |
|---|----------|--------|-----|
| ADR-001 | Full-stack Option C architecture (SPA + API + Postgres + auth + worker) | Accepted | [ADR-001](docs/adrs/ADR-001-full-stack-architecture.md) |
| ADR-002 | pnpm monorepo: `apps/web`, `apps/api`, `packages/domain`; worker inside `apps/api` | Accepted | [ADR-002](docs/adrs/ADR-002-monorepo-structure.md) |
| ADR-003 | Server-side market-data proxy with provider interface + cache + manual override | Accepted | [ADR-003](docs/adrs/ADR-003-market-data-proxy.md) |
| ADR-004 | Managed PostgreSQL as system of record via Drizzle; money in integer cents | Accepted | [ADR-004](docs/adrs/ADR-004-postgres-storage.md) |
| ADR-005 | Transaction journal is source of truth; B3 nota de corretagem import in V1 | Accepted | [ADR-005](docs/adrs/ADR-005-transaction-journal.md) |
| ADR-006 | Email/password + httpOnly cookie sessions; per-user data isolation | Accepted | [ADR-006](docs/adrs/ADR-006-auth-multiuser.md) |
| ADR-007 | Scheduled sync worker: quotes, daily snapshots, dividend agenda, backups | Accepted | [ADR-007](docs/adrs/ADR-007-scheduled-worker.md) |
| ADR-008 | Platform-hosted api+worker with managed Postgres; no secrets in frontend | Accepted | [ADR-008](docs/adrs/ADR-008-hosting-deployment.md) |
| ADR-009 | Tailwind v4 theme on DocuForge tokens + Recharts; data-dense dashboard UI | Accepted | [ADR-009](docs/adrs/ADR-009-design-system-frontend.md) |
| ADR-010 | Security foundation: server-side secrets, CORS lockdown, rate limits, zod | Accepted | [ADR-010](docs/adrs/ADR-010-security.md) |
| ADR-011 | Docker-first principal PostgreSQL/API/worker/web and isolated real-DB E2E; managed deploy option retained | Accepted | [ADR-011](docs/adrs/ADR-011-docker-first-runtime.md) |

---

# Domain Data Model

| Entity | Purpose | Notes |
|--------|---------|-------|
| `User` | Auth identity | Owner scope for all records |
| `Portfolio` | Named container of holdings (per user) | e.g., "Minha carteira", "Previdência" |
| `Broker` / `Account` | Where assets are held | Enables consolidation across brokers |
| `Asset` | Catalog entry: ticker, name, class, currency, sector | Class: acao/fii/etf/bdr/crypto/rf/tesouro/indice |
| `Transaction` | Journal row: buy/sell/dividend/split/adjustment | Source of truth for positions |
| `Holding` | Derived position: asset × portfolio × quantity × avg price | Computed from journal, materialized for reads |
| `Dividend` | Provento: ex-date, pay-date, value, status | Powers agenda de dividendos |
| `Quote` | Price point: symbol, timestamp, price, currency, source | Cached market data with TTL |
| `PortfolioSnapshot` | Daily total value + allocation | Powers performance-over-time chart |
| `BenchmarkSeries` | Daily Selic/CDI/IPCA/IBOV/IFIX/SPX | Cached via worker + proxy |

All user-owned tables include an owner scope enforced by the API layer.

---

# Non-Goals (V1)

- Real-time streaming quotes (intraday delay is acceptable; daily close is the primary cadence)
- Options, futures, or leveraged derivative tracking
- Tax reporting (IRPF/GCAP) and fee aggregation
- Open Finance / bank account aggregation
- AI agent integration and smart recommendations
- Native mobile apps (responsive web only)
- Notifications / alerts
- News feeds and social features
- Orders execution / trading

---

# Success Criteria

The system is considered functional when it can:

1. Authenticate multiple users and keep each user's portfolio fully isolated.
2. Register holdings via manual entry, CSV/JSON import, or the B3 nota de corretagem import.
3. Reconcile a position from an imported B3 nota de corretagem (buy/sell/dividend) into the journal and derive the resulting position correctly.
4. Show consolidated portfolio value, cost basis, and unrealized P&L per asset and in total, accurate to the last confirmed quote.
5. Refresh prices automatically (intraday TTL + daily close) with graceful fallback to last-known-good and manual override.
6. Render the dividend agenda and income by month/asset.
7. Show performance over time (daily snapshots) compared with CDI, IBOV, IFIX and S&P 500.
8. Produce full JSON/CSV export and automatic backups on a schedule.
9. Allow the same data to be accessed from multiple devices with identical results.
10. Run the UI following the DocuForge design system extended as a data-dense dashboard.

---

# Related Documents

| Topic | Document |
|-------|----------|
| System architecture (this file) | `architecture.md` |
| Architecture index | `index.md` |
| Folder schema | `architecture-folder-schema.md` |
| Decision records | `docs/adrs/ADR-001-*.md` … `ADR-011-*.md` |
| API specification | `docs/backend/api-specification.md` (planned) |
| Frontend component architecture | `docs/frontend/component-architecture.md` (planned) |
| Feature catalog | `docs/feature/` (planned) |
| Design system | `docs/design-system.md` (planned) |
| Commit convention | `commit-pattern.md` |

---

# Open Questions

- Optional managed deployment provider preference (Neon vs Supabase vs Railway) — finalize only if deploying outside the Docker-first default.
- Optional hosted platform preference for api+worker (Railway vs Fly.io vs Render); production TLS/off-host backups remain deployment decisions.
- Auth scope: email/password only in V1, or also Google OAuth at launch.
- Broker list must be extensible; acceptable to seed a preconfigured set (XP, Rico, Clear, Nu Invest, Inter) in V1.
- Whether Tesouro Direto prices should be imported from an external source or manually entered in V1.
