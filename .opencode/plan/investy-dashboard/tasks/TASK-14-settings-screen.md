# Task Template

## Task Information

### ID

TASK-14

### Title

Settings Screen — Profile, Portfolios, Brokers, Export, Backups, Overrides, Danger Zone (M8/M9 Frontend)

### Owner

senior-frontend

### Status

Pending

---

## Description

Build the settings screen (`/settings`) — the data-ownership and configuration surface. Sections: profile (edit name/email), portfolios CRUD (list, create, edit, delete), brokers/accounts CRUD, export controls (JSON/CSV download buttons), backup status display, price-override management (list, clear), and the danger zone (account erasure with double-confirmation). All mutations go through the API endpoints built by the backend; the screen follows the DocuForge dashboard language with data-dense forms, tables, and chips. Every destructive action (portfolio delete, account erasure) requires explicit confirmation.

---

## Acceptance Criteria

- [ ] `/settings` page renders with all sections (profile, portfolios, brokers/accounts, export, backups, overrides, danger zone)
- [ ] Profile section: edit name and email; save via API; success/error feedback
- [ ] Portfolios section: list user portfolios; create, edit, delete with confirmation
- [ ] Portfolio delete blocked client-side when password-protected action requires confirmation
- [ ] Brokers/accounts section: list brokers (seeded + custom); add custom broker; account CRUD
- [ ] Export section: JSON and CSV download buttons; triggers `POST /export` and downloads stream
- [ ] Backup section: displays last backup time and status from `GET /settings/backups`
- [ ] Overrides section: lists user price overrides with asset symbols; clear individual or all
- [ ] Danger zone: account erasure flow with double-confirmation (typed email + confirm button)
- [ ] Erasure confirmation disables submit until confirmation matches
- [ ] All sections show loading skeletons and empty states
- [ ] All sections show error cards with retry on API failure
- [ ] All screens pass build/typecheck/lint

---

## Dependencies

### Required Tasks

- TASK-13
- TASK-06

### Dependency Notes

Requires TASK-13 for the backend export/backups/overrides/erasure endpoints, and TASK-06 for the UI foundation (layout, form components, status badges, API client).

---

## Technical Context

### Relevant Components

- `apps/web/src/pages/Settings.tsx` — settings page
- `apps/web/src/components/settings/ProfileSection.tsx` — profile management
- `apps/web/src/components/settings/PortfoliosSection.tsx` — portfolio CRUD
- `apps/web/src/components/settings/BrokersSection.tsx` — brokers/accounts CRUD
- `apps/web/src/components/settings/ExportSection.tsx` — export download buttons
- `apps/web/src/components/settings/BackupSection.tsx` — backup status
- `apps/web/src/components/settings/OverridesSection.tsx` — override management
- `apps/web/src/components/settings/DangerZone.tsx` — account erasure

### Relevant Modules

- Settings / Data module (M9)

### Relevant APIs

- `POST /export`
- `GET /settings/backups`
- `GET /settings/overrides`
- `DELETE /settings/account`
- `GET/POST/PATCH/DELETE /portfolios`
- `GET/POST/PATCH/DELETE /accounts`
- `GET /brokers`, `POST /brokers`

### Relevant Types

- `User` (id, email, name)
- `Portfolio` (id, name, isDefault)
- `Broker` (id, name, code, url)
- `Account` (id, portfolioId, brokerId, name, accountNumber)
- `BackupStatus` (lastBackup, status, retentionNote)
- `Override` (assetId, symbol, priceCents, currency, createdAt)

---

## Implementation Guidance

### Expected Changes

- Implement `apps/web/src/pages/Settings.tsx` — tabbed or sectioned layout
- Implement profile section — form with name/email
- Implement portfolios section — table with CRUD and confirm dialogs
- Implement brokers/accounts section — broker list + account CRUD
- Implement export section — download buttons, error handling
- Implement backup section — status chip/card
- Implement overrides section — list with clear actions
- Implement danger zone — double-confirmation erasure flow
- Wire TanStack Query mutations and invalidations for each section
- Add download handler (trigger browser download from streamed response)

### Constraints

- pt-BR labels and messages throughout
- Destructive actions require confirmation (design-06)
- Account erasure requires double-confirmation (typed email or password) (design-06)
- Loading skeletons and empty states per design-05
- Error cards with retry per design-05
- Responsive: settings sections stack vertically on mobile
- Export triggers a real file download (browser download)

### Validation Rules

- Profile email is valid (zod-like client validation)
- Portfolio name is required
- Erasure confirmation input must match the user's email exactly
- Override clear — confirm before removing
- All mutations show pending/success/error states

---

## Edge Cases

- No portfolios — show "create first portfolio" CTA
- No accounts — show "add account" CTA
- No backups yet — show "no backups" state
- No overrides — show empty state
- Export download fails (network) — error card with retry
- Erasure confirmation mismatch — disable confirm button
- Erasure while other tabs open — session invalidated on next request
- Very long portfolio list — allowed; settings page scrolls
- Custom broker with duplicate code — API returns 409; show error
- Account delete with transactions — API blocks; show error message
- Session expires during settings page — redirect to /login

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/web/src/lib/api.ts` — also TASK-06 (creates), TASK-07, TASK-09, TASK-11, TASK-12 (add methods). **Merge strategy: parallel with careful merge** — this task adds export/settings/erasure methods only; never modify shared helpers.

---

## Testing

### Unit Tests

- [ ] Profile section: renders user data, saves edits
- [ ] Portfolios section: lists and CRUDs portfolios
- [ ] Export section: download buttons wired to API
- [ ] Backup section: renders status
- [ ] Overrides section: lists and clears overrides
- [ ] Danger zone: erasure confirmation gate

### Integration Tests

- [ ] Settings page loads all sections
- [ ] Profile edit updates user
- [ ] Portfolio create → appears in list
- [ ] Export download triggered
- [ ] Override clear removes row
- [ ] Erasure flow requires matching confirmation

### Manual Validation

- [ ] `pnpm dev` in `apps/web` — settings page renders all sections
- [ ] Edit profile → save → persists
- [ ] Create portfolio → appears on holdings selector
- [ ] Export JSON → downloads file
- [ ] Clear override → removed from list
- [ ] Erasure: wrong email blocks; correct email confirms

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

- ADR-006: Multi-user isolation (settings scoped per user)
- design-02: Screen map (`/settings`)
- design-05: Component grammar, forms, states
- design-06: Export/erasure UX
- design-07: M8 Reports + export + settings (frontend portion)