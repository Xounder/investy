# Design 01 — Product Scope and Module Boundaries

## Context

### Problem Statement

Investy must deliver a coherent V1 of a multi-user Brazilian investment portfolio dashboard, consolidating holdings from multiple brokers across asset classes (ações, FIIs, ETFs nacionais/americanos/irlandeses, BDRs, cripto, renda fixa, Tesouro Direto, índices). V1 must reconcile every success criterion in `architecture.md` with ADR-005 (transaction journal + B3 nota import as day-one features). The team needs an explicit, agreed boundary between V1, V2, and non-goals before any implementation.

### Goals

- Define the functional modules that compose Investy V1.
- Explicitly state what is V1, what is V2, and what is permanently out of scope.
- Reconcile the feature set with architecture success criteria 1–10 and ADR-005.
- Give downstream agents (Tech Lead, Frontend, Backend, QA) an unambiguous module map.

### Constraints

- Transaction journal is the single source of truth (ADR-005, architecture.md Core Principles).
- Multi-user isolation, market-data proxy, integer-cent money, and the DocuForge dashboard language are fixed (ADR-004/003/009).
- Non-goals in architecture.md (tax reporting, derivatives, real-time streaming, orders, news/social, AI, native apps, notifications) bound V1.
- User-confirmed decisions: multi-portfolio UI day one; FII cadence-based dividend projection in V1; B3 nota import at full scope (PDF + text/CSV/XML, rateio de custos); USD quote + FX valuation for foreign assets; average-cost realized P&L for display only.

---

## Options Considered

### Option A — Minimal vertical slice

#### Description

Deliver holdings + manual/CSV entry + quotes only in V1; defer the transaction journal, nota import, dividends, and performance-over-time to V2.

#### Advantages

- Smallest V1, fastest first launch.
- Less upfront engineering on parser and derivation math.

#### Disadvantages

- Violates ADR-005 directly (journal + nota import are V1 by decision).
- Fails success criteria 2, 3, 6, 7 (nota reconciliation, dividend agenda, performance over time).

#### Effort Estimate

Small — but incorrect scope; rejected.

### Option B — Dashboard-only emphasis

#### Description

Invest most V1 effort in the dashboard/reporting surface (charts, KPIs), with simple input paths behind it.

#### Advantages

- Strong first impression for the flagship screen.

#### Disadvantages

- Input paths (journal, nota, dividends) would be shallow; success criteria 2/3 still unmet without solid journal ingestion.

#### Effort Estimate

Medium — rejected: input depth is the harder, more valuable problem.

### Custom Option (Selected) — Full V1 module set per approved presentation

#### Description

Nine modules, journal-first, with the user-confirmed V1 expansions. The module set below is the settled V1 scope.

#### Notes

- The custom option is the result of the approved design presentation and the user's confirmed decisions.
- Realized P&L is computed (average-cost) and displayed but stored for display only; no DARF/tax derivation (non-goal).

---

## Decision

### Selected Option

Custom Option: the nine-module V1 scope as presented and approved.

### Reasoning

- It is the only option that satisfies all ten success criteria and ADR-005.
- The user explicitly approved full scope for the high-risk items (nota import, multi-portfolio, dividend projection, FX valuation) — paying the effort to de-risk them in V1.
- The module map gives each pipeline agent a stable decomposition.

### Trade-offs Accepted

- Larger MVP (≈40 dev-days, matching ADR-001's 4–6 week estimate) over a thinner launch.
- Nota parser and journal derivation are the highest-risk code and are scheduled first.

---

### V1 Module Map

| # | Module | Core job | V1 screens/features |
|---|---|---|---|
| M1 | Auth & Onboarding | Identity + session + first setup | signup, login, password reset, logout, onboarding wizard (default portfolio → broker → first asset entry) |
| M2 | Dashboard hub | One-glance consolidation | KPI strip, benchmark indicator strip, allocation donut, performance spark, agenda preview, recent transactions, quick actions (deep-link widgets) |
| M3 | Portfolio / Holdings | Positions per asset | holdings table (qty, avg price, cost, market value, day Δ, unrealized P&L, %), asset detail (lots, quote, events), multi-portfolio selector |
| M4 | Transactions / Journal | Single source of truth | journal table with filters, manual entry form (buy/sell/dividend/jcp/amortization/split/adjustment), CSV import wizard |
| M5 | Nota de Corretagem | B3 nota → journal | upload (PDF/text/CSV/XML), parse preview, rateio de custos display, reconciliation warnings, confirm→append |
| M6 | Dividends | Agenda + income history | agenda timeline (ex-date primacy, user-confirmable pay date, status chips), income by month/asset, FII cadence projection |
| M7 | Assets Catalog | Search/browse assets | searchable catalog, "mais buscados", asset page, price override, corporate events |
| M8 | Reports / Analytics | Performance over time | performance vs CDI/IBOV/IFIX/S&P 500, realized P&L history, dividend income bars, monthly/quarterly granularity |
| M9 | Settings / Data | Ownership + config | profile, portfolios CRUD, brokers/accounts CRUD, import/export, backup status, overrides management |

### V1 Boundary — explicit

**In V1**
- Journal as source of truth; manual holding entry, CSV/JSON import, and B3 nota import all materialize as journal events (ADR-005).
- Corporate-action events: split/desdobramento, bonificação, JCP, amortização; realized P&L stored per sale (average-cost).
- Materialized holdings recomputed transactionally; daily portfolio snapshots + benchmark series (ADR-007).
- Quote proxy + TTL cache + last-known-good + manual override; Selic/CDI/IPCA indicators (ADR-003).
- Multi-portfolio UI day one; FII dividend projection in V1; pt-BR only; all snapshots retained indefinitely (no pruning).
- Full nota scope: PDF + text/CSV/XML, rateio de custos proportional per operation, reconciliation warnings, preview→confirm.

**Deferred to V2**
- Price targets, news feeds, notifications/alerts, AI/recommendations, native mobile apps.
- Tax reporting (IRPF/DARF/GCAP) — nota captures cost fields; V1 does not compute liabilities.
- Open Finance / bank aggregation; OAuth login (OAuth2-ready seam only, ADR-006).

**Non-goals (per architecture.md)**
- Real-time streaming quotes, options/futures/leveraged derivatives, order execution.

---

## Impact

### Documentation Affected

- `design-02-information-architecture-ux.md` (module → screen mapping)
- `design-03-domain-data-model.md` (entities per module)
- `design-04-rest-api-contract.md` (endpoints per module)
- `design-07-effort-sequence-estimate.md` (module sizing)

### Architecture Affected

- Consumes `architecture.md` domain model, non-goals, and success criteria 1–10.
- Consumes ADR-004, ADR-005, ADR-006, ADR-007.

### Dependencies Added

- None new — reuses the approved stack (ADR-001..010).

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Nota parser format drift across brokers | Medium | High | Versioned parser, field-mapping table, tolerant layout matching, reconcile warnings before confirm |
| Full scope delays first usable release | Medium | Medium | Build order keeps journal+holdings+quotes first; dashboard/reports late |
| Dividend projection flagged as "guaranteed" by users | Medium | Low | UI labels projections with confidence and a "confirm in aviso" hint |
| Tesouro/fixed income has no quote source | High | Low | Fully manual pricing + amortization events (user-confirmed) |

---

## Open Questions

- None — scope boundary approved by the user.