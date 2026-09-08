# Design 05 — Design System Application (DocuForge → Dashboard)

## Context

### Problem Statement

The UI must realize the DocuForge design system tokens in a data-dense investment dashboard language (ADR-009) — "something more" than a documentation theme — while staying consistent, accessible, and responsive.

### Goals

- Map DocuForge tokens to the dashboard composite components (KPI cards, tables, chips, strips, charts, states).
- Define the Recharts theming contract grounded in the DocuForge palette.
- Specify empty/loading/error states and responsive behavior for the confirmed IA (design-02).
- Give frontend agents the exact component grammar to build and QA agents the criteria to verify.

### Constraints

- Palette: primary `#2563EB`, secondary `#7C3AED`, tertiary gray `#6B7280`; bg `#FAFAFA`, surface `#FFFFFF`; success `#16A34A`, warning `#CA8A04`, error `#DC2626`.
- Type: Plus Jakarta Sans (display), Inter (body/caption/overline), tabular numerals for money; light theme baseline.
- Tailwind CSS v4 token theming; Recharts; responsive sidebar collapse (ADR-009).
- pt-BR UI (user-confirmed), `Intl.NumberFormat('pt-BR')` currency formatting.

---

## Options Considered

### Option A — Stock component library on DocuForge tokens (shadcn/MUI)

#### Description

Adopt a Radix/shadcn baseline for primitives and style it with the token set.

#### Advantages

- A11y and focus management for free; fast primitive coverage.

#### Disadvantages

- Stock look fights the bespoke "dashboard language"; heavier overrides for density.

#### Effort Estimate

Medium — shortlisted for primitives only (ADR-009 already notes pulling chip/KPI patterns from shadcn).

### Option B — Bespoke token-first component set

#### Description

Hand-build the compact set of dashboard composites directly on Tailwind tokens; no library shell.

#### Advantages

- Exact DocuForge look; small surface; fully consistent.

#### Disadvantages

- Must self-manage a11y behaviors (keyboard, focus).

#### Effort Estimate

Medium — selected hybrid: bespoke composites + Radix primitives where focus/keyboard complexity is high.

### Custom Option (Selected) — Token-first composites + Radix base primitives

#### Description

The component grammar below, on Tailwind v4 tokens, with Radix primitives (dialog, popover, tabs) for accessibility-sensitive widgets; Recharts themed from the palette.

#### Notes

- Light theme is the baseline (ADR-009); no dark theme in V1.

---

## Decision

### Selected Option

Custom Option B (token-first composites with Radix primitives) as presented and approved.

### Reasoning

- Delivers the approved "DocuForge, and something more" (ADR-009).
- Keeps the component surface small and testable; offloads a11y to Radix where it matters.

### Trade-offs Accepted

- Some chart tooltip styling is custom (Recharts composite tooltips).
- Small bespoke CSS lives under the token theme.

---

## Component Grammar

| Composite | Tokens | Behavior spec |
|---|---|---|
| **Sidebar nav** | surface bg, primary band on active, breakdown icon | collapse → overlay on mobile; persistent rail on desktop |
| **Top bar** | surface, caption/overline labels | global search (assets), portfolio selector, "+ Registrar" button (secondary→primary hover) |
| **KPI card** | Plus Jakarta ExtraBold 30 value, Inter 14 label, delta chip | net/gross display; skeleton variant; tooltip source |
| **Indicator strip** | chips (CDI/Selic/IBOV/IFIX/SPX), status dot | stale/override badge color-coded (warning chip) |
| **Holdings/journal table** | Inter + tabular-numerals, sticky header, class chip, status badge, inline band, row actions | responsive horizontal scroll; first column sticky on mobile; P&L success/error coloring |
| **Position drawer / asset drawer** | surface, secondary header, quote band | full-screen sheet on mobile; deep-linkable (design-02) |
| **Nota preview panel** | table + warnings panel (warning chips) + confirm footer | importToken lifecycle; per-item toggle |
| **Agenda timeline** | date rail, ex-date primary, pay-date chip (expected/confirmed/paid) | user confirm action promotes status |
| **Empty / loading / error states** | skeleton (table/chart geometry), empty CTA banner, error card with retry | TanStack Query error → retry; empty → journey CTA |
| **Charts wrapper** | Recharts theme (below) | tooltips in token palette, pt-BR Intl |

## Recharts Theme Contract

- **Donut (allocation class/sector)**: palette seeded `#2563EB ° #7C3AED ° #8B5CF6 ° #60A5FA ° #A78BFA ° #D1D5DB`; center label = total BRL; legend = chips.
- **Area/Line (performance)**: portfolio `#2563EB`, CDI `#6B7280`, IBOV `#7C3AED`, IFIX `#16A34A`, SPX `#CA8A04`; grid `#E5E7EB`; axis labels Inter 12.
- **Bar (dividend income)**: month bars `#7C3AED`, positive only; tooltip BRL.
- Shared Axis/Y formatting via `Intl` + tabular-numerals CSS; empty series renders the empty state, not a bare plot.

## States & Responsiveness

- Loading: skeletons mirroring geometry; charts show shimmer placeholder.
- Error: TanStack Query error boundary → message + retry; quote staleness renders as warning chip, never as failure (ADR-003 degradation).
- Responsive: sidebar overlay < md; tables horizontal-scroll + sticky first column; drawers become full-screen sheets; KPI grid 4 → 2 → 1 columns; charts reflow via `ResponsiveContainer`.

---

## Impact

### Documentation Affected

- `design-02-information-architecture-ux.md` (flows build on these composites)
- `design-04-rest-api-contract.md` (data shapes the charts/tables consume)

### Architecture Affected

- ADR-009 fully realized; `docs/frontend/component-architecture.md` seeded by this grammar.

### Dependencies Added

- Tailwind v4 theme config, Radix primitives (tabs, dialog, popover), Recharts, table + numeral helpers (domain formatting package).

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Custom tooltip/cartesian work expands scope | Medium | Medium | Constrain to the 3 chart types; reuse a shared tooltip component |
| Tailwind v4 theme token drift from DocuForge | Low | Medium | Single token source file; CI snapshot check optional |
| Color-coded money hurts accessibility | Medium | Medium | Success/error hues paired with sign/symbol, not color alone |

---

## Open Questions

- None — design language approved (ADR-009 + presentation §4).