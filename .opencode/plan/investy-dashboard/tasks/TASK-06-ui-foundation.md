# Task Template

## Task Information

### ID

TASK-06

### Title

UI Foundation — Tailwind Theme, Design System Composites, Layout, Routing (M0 Frontend)

### Owner

senior-frontend

### Status

Pending

---

## Description

Build the frontend foundation: Tailwind CSS v4 theme with DocuForge tokens, the design system composite components, the application layout (sidebar navigation, top bar, content area), React Router route structure, TanStack Query provider, Zustand store for transient UI state, and the API client layer. This task creates the reusable component grammar that all subsequent frontend tasks consume: KPI cards, indicator chips, data tables (with tabular numerals), status badges, skeleton/empty/error states, and the Recharts theme configuration. The sidebar navigation follows the DocuForge idiom with collapse-on-mobile. The top bar includes global asset search, portfolio selector, and the "+ Registrar" button. All UI strings are in pt-BR.

---

## Acceptance Criteria

- [ ] Tailwind CSS v4 configured with DocuForge tokens: primary `#2563EB`, secondary `#7C3AED`, tertiary `#6B7280`, bg `#FAFAFA`, surface `#FFFFFF`, success `#16A34A`, warning `#CA8A04`, error `#DC2626`
- [ ] Typography: Plus Jakarta Sans (display headings), Inter (body/caption), tabular numerals CSS for money
- [ ] Sidebar navigation: persistent rail on desktop, overlay on mobile (< md breakpoint); active item gets primary blue band
- [ ] Top bar: global search input, portfolio selector dropdown, "+ Registrar" button (secondary → primary hover)
- [ ] React Router configured with all V1 routes: `/`, `/login`, `/signup`, `/forgot-password`, `/onboarding`, `/holdings`, `/holdings/:portfolioId`, `/assets/:symbol`, `/transactions`, `/transactions/import`, `/transactions/import/nota`, `/dividends`, `/assets`, `/reports`, `/settings`
- [ ] TanStack Query provider wrapping the app
- [ ] Zustand store for transient UI state (drawer open/close, active portfolio, overlay state)
- [ ] API client layer (`apps/web/src/lib/api.ts`) with typed fetch wrapper, session cookie handling, error normalization
- [ ] KPI card composite: Plus Jakarta ExtraBold 30 value, Inter 14 label, delta chip; skeleton variant
- [ ] Indicator strip: chips for CDI/Selic/IBOV/IFIX/SPX with status dots
- [ ] Data table composite: sticky header, tabular numerals, P&L coloring, horizontal scroll, sticky first column on mobile
- [ ] Status badge/chip component (expected/confirmed/paid/warning states)
- [ ] Empty state component with CTA banner
- [ ] Loading skeleton component (table/chart geometry)
- [ ] Error card with retry button
- [ ] Recharts theme: donut palette, area/line palette, bar palette, tooltip styling, axis formatting
- [ ] Layout component: sidebar + top bar + content area; responsive collapse
- [ ] Auth pages skeleton: login, signup, forgot-password (basic forms, wired to API)
- [ ] Onboarding wizard skeleton: portfolio → broker → first entry (basic flow)
- [ ] `pnpm dev` renders the layout with sidebar and placeholder content
- [ ] All components pass build/typecheck/lint

---

## Dependencies

### Required Tasks

- TASK-01

### Dependency Notes

Requires TASK-01 for the monorepo scaffold, Vite config, and React/TypeScript setup. Frontend work is independent of backend tasks.

---

## Technical Context

### Relevant Components

- `apps/web/src/components/ui/` — composite components (KpiCard, IndicatorStrip, DataTable, StatusBadge, Skeleton, EmptyState, ErrorCard)
- `apps/web/src/components/layout/` — Sidebar, TopBar, Layout
- `apps/web/src/components/charts/` — Recharts theme and wrapper
- `apps/web/src/lib/api.ts` — API client
- `apps/web/src/lib/format.ts` — money formatting (pt-BR Intl)
- `apps/web/src/stores/` — Zustand stores
- `apps/web/src/routes/` — route configuration
- `apps/web/src/app.tsx` — root component with providers

### Relevant Modules

- Design system application (design-05)
- IA/UX Option C (design-02)

### Relevant APIs

- API client consumes endpoints from design-04 (types only, not wired yet)

### Relevant Types

- `Portfolio` (id, name) — for selector
- `User` (id, email, name) — for auth state
- Chart data types (for Recharts theme)

---

## Implementation Guidance

### Expected Changes

- Configure Tailwind v4 with DocuForge token theme in `apps/web/src/index.css` or tailwind config
- Create typography CSS (Plus Jakarta Sans, Inter, tabular numerals)
- Implement sidebar navigation with collapse behavior
- Implement top bar with search, selector, and action button
- Implement layout component (sidebar + top bar + content)
- Implement React Router with all V1 routes
- Implement TanStack Query provider
- Implement Zustand store for UI state
- Implement API client with typed fetch
- Implement composite components: KpiCard, IndicatorStrip, DataTable, StatusBadge, Skeleton, EmptyState, ErrorCard
- Implement Recharts theme configuration
- Create auth page skeletons (login, signup, forgot-password)
- Create onboarding wizard skeleton
- Wire `pnpm dev` to render layout

### Constraints

- Tailwind CSS v4 (not v3) with DocuForge tokens (ADR-009)
- Plus Jakarta Sans for display, Inter for body (ADR-009)
- Tabular numerals for all money display (ADR-009)
- pt-BR only; no i18n framework needed (user-confirmed)
- Sidebar collapses to overlay on small screens (ADR-009)
- Responsive: KPI grid 4→2→1 columns; charts via ResponsiveContainer
- Radix primitives for accessible dialogs/popovers/tabs (design-05)
- Light theme baseline; no dark theme in V1 (ADR-009)
- No real API calls yet (skeleton UI only)

### Validation Rules

- All components render without errors in development
- Sidebar collapse/expand works on resize
- Tabular numerals apply to money values
- All routes are accessible via navigation
- TypeScript strict mode passes

---

## Edge Cases

- Empty sidebar on mobile — must still show hamburger/menu toggle
- Very long sidebar labels — truncate with ellipsis
- No user logged in — redirect to /login
- Session expired during navigation — redirect to /login with return URL
- Very long table content — horizontal scroll with sticky first column
- Chart with no data — render empty state, not bare axis
- Font loading failure — fallback to system sans-serif
- Tailwind v4 class conflicts — use `@layer` for custom styles
- Mobile drawer stack — drawers become full-screen sheets
- Zustand store hydration mismatch (SSR concern) — not applicable (SPA only)

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/web/src/stores/ui.ts` — also TASK-07 (adds drawer/portfolio slices). **Merge strategy: sequential** — this task creates the store; TASK-07 adds slices. If parallelized, TASK-07 must only append new slices, never edit existing ones.
- `apps/web/src/lib/api.ts` — also TASK-07, TASK-09, TASK-11, TASK-12, TASK-14 (add endpoint methods). **Merge strategy: parallel with careful merge** — this task creates the client + shared fetch/error helpers; later tasks ADD methods only (never modify shared helpers).
- `apps/web/src/components/charts/theme.ts` — also TASK-11, TASK-12 (consume/extend). **Merge strategy: sequential** — this task creates the theme; later tasks add their own palette constants.
- `apps/web/src/app.tsx` — also TASK-07 (adds routes). **Merge strategy: sequential** — this task creates the root; TASK-07 edits the route table only.
- `apps/web/playwright.config.ts` — also TASK-15 (adds test projects/spec paths). **Merge strategy: parallel with careful merge** — TASK-15 extends the config; never modify base projects created here.

---

## Testing

### Unit Tests

- [ ] KpiCard renders value, label, and delta
- [ ] DataTable renders rows with tabular numerals
- [ ] StatusBadge renders correct color for each status
- [ ] Skeleton renders loading state
- [ ] EmptyState renders CTA
- [ ] ErrorCard renders message and retry button
- [ ] API client normalizes errors
- [ ] Money format returns pt-BR currency string

### Integration Tests

- [ ] Layout renders sidebar + top bar + content
- [ ] Sidebar navigation changes route
- [ ] Auth redirect works (unauthenticated → /login)
- [ ] Responsive sidebar collapse on mobile

### Manual Validation

- [ ] `pnpm dev` in `apps/web` renders the layout
- [ ] Sidebar navigation works across all routes
- [ ] Responsive behavior on mobile viewport
- [ ] Typography and colors match DocuForge tokens

---

## Definition of Done

- [ ] Implementation completed
- [ ] Acceptance criteria satisfied
- [ ] Tests created or updated
- [ ] Build passes
- [ ] Lint passes
- [ ] Validation completed

---

## References

- ADR-009: Design system + Recharts
- design-02: Screen map, navigation scheme
- design-05: Component grammar, Recharts theme, states
- design-07: M0 Foundation milestone (frontend portion)
