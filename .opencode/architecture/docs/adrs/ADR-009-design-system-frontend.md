# ADR-009: Design System and Frontend Styling

**Status:** Accepted  
**Date:** 2026-09-04

## Context

The product must follow the **DocuForge** design system tokens while delivering a data-dense investment dashboard in the spirit of Investidor10 and Organizze — richer than a plain documentation theme ("DocuForge, and something more"). The dashboard needs charts, portfolio tables, KPI values, chips, cards, and structured sidebar navigation.

## Decision

- **Tailwind CSS v4** theming rooted in DocuForge tokens:

  - **Palette**: Primary `#2563EB` (blue), Secondary `#7C3AED` (purple), Tertiary `#6B7280` (gray); Background `#FAFAFA`, Surface `#FFFFFF`; semantic Success `#16A34A`, Warning `#CA8A04`, Error `#DC2626`, Info `#2563EB`.
  - **Typography**: Plus Jakarta Sans for display/headlines (40/30/22, ExtraBold/Bold/SemiBold), Inter for body (18/16/14), caption (12), overline (11); Fira Code for code (14).
  - **Spacing**: 8px base, generous whitespace.
  - **Components**: buttons (primary/secondary/ghost/destructive), inputs, cards, chips, tables, elevation subtle→overlay — extended with dashboard-specific composites (KPI cards, position tables, agenda timeline, indicator strip).
- **Charts**: **Recharts** — line/area for performance over time, donut for class/sector diversification, bars for dividend income. Colors derived from the DocuForge palette; `pt-BR`/BRL formatting via `Intl`.
- **State**: TanStack Query for server state/caching; Zustand for transient UI state.
- Responsive, mobile-web usable; the sidebar collapses to an overlay on small screens.

## Consequences

### Pros

- Consistent UI based on an approved token system; design stays predictable across features.
- Tailwind + design tokens keep custom CSS minimal and maintainability high.
- Recharts is declarative, themeable, and sufficient for dashboard charts without custom SVG work.

### Cons

- Tailwind v4 requires configuring token-based themes (spacing scale, custom colors) — small setup cost.
- Recharts leaves some advanced interactions (e.g. complex tooltips) to custom development.
- Keeping "something more" (data-dense language) while adhering to tokens requires disciplined design decisions.

## Alternatives Considered

- **Plain CSS / CSS variables without a utility framework**: rejected for V1 — more surface area to hand-roll, slower iteration.
- **React-based component library (MUI, shadcn/ui, Ant Design)**: considered; deferred — the product needs a bespoke DocuForge-faithful look, not a stock look; some patterns (chips/KPI) pulled from shadcn for accessibility.
- **visx / billboard.js instead of Recharts**: evaluated — Recharts chosen for maturity, ecosystem, and React ergonomics.