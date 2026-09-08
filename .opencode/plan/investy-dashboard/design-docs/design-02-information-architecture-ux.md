# Design 02 — Information Architecture and UX Flows

## Context

### Problem Statement

Investy V1 must present a data-dense, multi-module dashboard that stays discoverable for newcomers and fast for power users. The navigation, screen map, and key journeys must follow the DocuForge sidebar idiom (ADR-009) while supporting the approved global quick-add and deep-linking behaviors (Option C).

### Goals

- Define the screen map and navigation scheme for all nine V1 modules.
- Specify the approved Option C interaction model: module-per-screen skeleton, global "+ Registrar" quick action, inline holdings row actions, dashboard widgets that deep-link.
- Document the six key user journeys end to end.
- Give Frontend and QA agents a route/flow contract to implement and test.

### Constraints

- DocuForge tokens: Plus Jakarta Sans display type, Inter body, sidebar navigation (ADR-009).
- Translation: pt-BR only (user-confirmed) — UI strings are authored in Portuguese, labels below kept in English for documentation consistency.
- Responsive: sidebar collapses to overlay on small screens; tables scroll horizontally (ADR-009).
- Stateless SPA over JSON API; all mutable state server-side (multi-device, ADR-006).

---

## Options Considered

### Option A — Module-per-screen with dashboard hub (skeleton)

#### Description

Sidebar routes to one full-screen module each; dashboard is a hub of widgets that deep-link into modules.

#### Advantages

- Scalable mental model; low screen density; clean routing and testing.

#### Disadvantages

- More navigation hops for a power-user daily sweep.

#### Effort Estimate

Medium — used as the skeleton of the selected option.

### Option B — Single-screen command center

#### Description

One performance page is the app; holdings table is the primary surface with tabbed panels/drawers.

#### Advantages

- Fastest daily glance; fewest clicks; strongest density story.

#### Disadvantages

- Poor onboarding/discoverability, heavy mobile drawer stack, more complex E2E.

#### Effort Estimate

Medium — shortlisted, not selected.

### Custom Option (Selected) — Module-first, drawer-amplified (Option C)

#### Description

Option A structure plus three amplifiers: (1) a global "+ Registrar" quick action opened from anywhere as a drawer that writes journal entries; (2) inline row actions in the holdings table (contextual "sell"/"dividend" pre-filled from the position); (3) dashboard widgets deep-link into their module screens. Tabular numerals everywhere money is shown.

#### Advantages

- Keeps A's scalability and onboarding while closing B's power-user gap.
- Single mutation entry point (the drawer) reused across contexts — one place to learn/QA.

#### Disadvantages

- Drawer-based flows must handle deep routing and validation states.
- Slightly more frontend code than plain A.

#### Effort Estimate

Medium — selected by the user.

---

## Decision

### Selected Option

Custom Option C (module-first, drawer-amplified) as presented and approved.

### Reasoning

- Approved explicitly by the user in the design presentation (decision #1).
- Balances discoverability, data density, and a single well-tested mutation pattern.
- Best fit for multi-device/stateless SPA constraints: drawers are local UI, mutating via the same API as full screens.

### Trade-offs Accepted

- Drawers must compose with React Router (deep-linkable, dismissible, back-safe).
- Power-user flows cross module boundaries (a sell from holdings opens the same journal drawer as Transactions).

---

## Screen Map

```
/                                Dashboard hub (M2)
/login · /signup · /forgot-password        (M1)
/onboarding                     wizard: portfolio → broker → first entry (M1)
/holdings                       holdings table + portfolio selector (M3)
/holdings/:portfolioId          portfolio-scoped holdings (M3)
/assets/:symbol                 asset detail drawer/page (M3/M7)
/transactions                   journal + filters (M4)
/transactions/import            import wizard: CSV | Nota (M4/M5)
/transactions/import/nota       nota steps: upload → preview → confirm (M5)
/dividends                      agenda + income views (M6)
/assets                         catalog search (M7)
/reports                        performance vs benchmarks (M8)
/settings                       profile, portfolios, brokers, export/backup (M9)
/global-action                  "+ Registrar" drawer overlay on any screen (M4)
```

### Navigation scheme

- **Left sidebar** (docu-navigation per ADR-009): Dashboard, Carteira, Transações, Proventos, Ativos, Relatórios, Configurações; active item gets a primary blue band.
- **Top bar**: global search (assets), portfolio selector (multi-portfolio day one), and the persistent "+ Registrar" button.
- Money rendered with tabular numerals; side labels in pt-BR only.

## Key Journeys

1. **Onboarding** — signup → auto-create default portfolio → pick broker (seeded XP/Rico/Clear/NuInvest/Inter + custom) → optional "add first asset" via manual, CSV, or nota → land on dashboard with empty KPI cards guiding the next action.
2. **Daily check** — dashboard KPI strip (total, cost, unrealized P&L) → holdings table → drill into an outlier via asset detail → stale quote? open price override from the asset screen. Every journal event updates holdings/KPIs immediately (cache invalidation on write).
3. **Adding/selling a position** — "+ Registrar" drawer from anywhere: pick type/direction, autocomplete symbol from catalog, qty, unit price, fees, account, date; sell flows pre-filled from the holdings row (inline action). Submission appends one or more journal rows.
4. **Nota day** — Transactions → Import → Nota → upload PDF (or paste text / CSV/XML) → preview table shows parsed negócios with fees and rateio de custos → warnings panel for unmapped assets/date mismatches → confirm → journal grows; holdings reconcile; any split/JCP events surfaced.
5. **Dividend month** — Dividends → agenda: ex-date primacy, pay-date user-confirmable chip, per-asset income, FII cards show next projected payment (cadence-based, confidence-labeled). Confirming a pay date upgrades expected → confirmed → paid.
6. **Quarterly reporting** — Relatórios → performance chart (portfolio vs CDI/IBOV/IFIX/S&P 500) with monthly/quarterly toggle → realized P&L history → export JSON/CSV from Settings → verify snapshot continuity.

---

## Impact

### Documentation Affected

- `design-05-design-system-application.md` (component contracts for the above flows)
- `design-04-rest-api-contract.md` (endpoints supporting the journeys)

### Architecture Affected

- ADR-009 (sidebar, tokens, drawer/density language).
- ADR-006 (stateless SPA, server-side mutations).

### Dependencies Added

- React Router (routes above), TanStack Query invalidations, Zustand for drawer/overlay transient state.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Drawer flows break browser back/nav | Medium | Medium | Route-backed drawers; deep-linkable; dismissal restores prior query state |
| Onboarding guidance drift with empty accounts | Medium | Low | Empty states carry CTAs pointing to the wizard/import paths |
| Mobile density of holdings table | High | Medium | Horizontal scroll + sticky first column; responsive breakpoints per ADR-009 |

---

## Open Questions

- None — IA/UX Option C approved.