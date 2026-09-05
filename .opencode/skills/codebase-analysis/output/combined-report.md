# Codebase Analysis — Combined

Generated: 2026-06-18T02:23:59.228Z

```
# Combined Report

Implementation:

╔══════════════════════════════════════════╗
║     Codebase — Implementation Report     ║
╚══════════════════════════════════════════╝

Generated: 2026-06-18T02:23:59.157Z
Parser:    regex

── Overview ──
  Total files:      85 (TS: 47, TSX: 38)
  Total imports:    255
  Total exports:    158
  Functions:        130
  Arrow functions:  22
  Classes:          4
  Interfaces:       68
  Type aliases:     5
  React components: 3

── Per Package ──
  apps/web:
    Files:        49
    Imports:      173
    Exports:      59
    Declarations: 127
  apps/api:
    Files:        11
    Imports:      42
    Exports:      19
    Declarations: 25
  packages/shared:
    Files:        3
    Imports:      1
    Exports:      22
    Declarations: 11
  packages/domain:
    Files:        11
    Imports:      25
    Exports:      27
    Declarations: 36
  packages/calendar:
    Files:        6
    Imports:      10
    Exports:      21
    Declarations: 18
  packages/ui:
    Files:        5
    Imports:      4
    Exports:      10
    Declarations: 12

── Top Dependencies ──
  @brkroutnxdle/shared           50
  react                          45
  express                        10
  ./types.js                     7
  ../contexts/CalendarContext    6
  ../middleware/auth.js          6
  ../contexts/SettingsContext    5
  ../services/api                5
  @tanstack/react-query          5
  ../contexts/PreviewContext     5
  ../middleware/errorHandler.js  5
  @brkroutnxdle/domain           4
  ../contexts/BlockContext       4
  ../contexts/TaskContext        3
  ./contexts/AuthContext         2

── Files Scanned ──
  apps/api/src/index.ts
  apps/api/src/middleware/auth.ts
  apps/api/src/middleware/errorHandler.ts
  apps/api/src/middleware/rateLimiter.ts
  apps/api/src/routes/auth.ts
  apps/api/src/routes/calendars.ts
  apps/api/src/routes/events.ts
  apps/api/src/services/calendar-client.ts
  apps/api/src/services/google-oauth.ts
  apps/api/src/services/session.ts
  apps/api/src/types.ts
  apps/web/src/App.tsx
  apps/web/src/components/CalendarView.tsx
  apps/web/src/components/DevModeBadge.tsx
  apps/web/src/components/DevModePanel.tsx
  apps/web/src/components/ErrorBoundary.tsx
  apps/web/src/components/ErrorFallback.tsx
  apps/web/src/components/Header.tsx
  apps/web/src/components/MainLayout.tsx
  apps/web/src/components/SettingsModal.tsx
  apps/web/src/components/Sidebar.tsx
  apps/web/src/contexts/AuthContext.tsx
  apps/web/src/contexts/BlockContext.tsx
  apps/web/src/contexts/CalendarContext.tsx
  apps/web/src/contexts/PreviewContext.tsx
  apps/web/src/contexts/SettingsContext.tsx
  apps/web/src/contexts/TaskContext.tsx
  apps/web/src/features/blocks/BlockCard.tsx
  apps/web/src/features/blocks/BlockModal.tsx
  apps/web/src/features/blocks/BlockPanel.tsx
  apps/web/src/features/completion/CompletionAction.tsx
  apps/web/src/features/completion/ConflictDialog.tsx
  apps/web/src/features/completion/RefreshButton.tsx
  apps/web/src/features/preview/AllocationFailurePanel.tsx
  apps/web/src/features/preview/CalculateWeekButton.tsx
  apps/web/src/features/preview/DeleteEventDialog.tsx
  apps/web/src/features/preview/PreviewToolbar.tsx
  apps/web/src/features/preview/SaveButton.tsx
  apps/web/src/features/shared/CreateActionModal.tsx
  apps/web/src/features/tasks/TaskCard.tsx
  apps/web/src/features/tasks/TaskModal.tsx
  apps/web/src/features/tasks/TaskPanel.tsx
  apps/web/src/hooks/useBlocks.ts
  apps/web/src/hooks/useCalendar.ts
  apps/web/src/hooks/useCalendarRefresh.ts
  apps/web/src/hooks/useCompletion.ts
  apps/web/src/hooks/useDevMode.ts
  apps/web/src/hooks/useSaveSchedule.ts
  apps/web/src/hooks/useScheduleEditing.ts
  apps/web/src/hooks/useScheduleGeneration.ts
  apps/web/src/hooks/useSettings.ts
  apps/web/src/hooks/useTasks.ts
  apps/web/src/hooks/useUnsavedChanges.ts
  apps/web/src/main.tsx
  apps/web/src/pages/DashboardPage.tsx
  apps/web/src/pages/LoginPage.tsx
  apps/web/src/services/api.ts
  apps/web/src/services/calendarCache.ts
  apps/web/src/services/diffCalculator.ts
  apps/web/src/services/localStorage.ts
  packages/calendar/src/index.ts
  packages/calendar/src/internal/metadata.ts
  packages/calendar/src/internal/normalizer.ts
  packages/calendar/src/internal/types.ts
  packages/calendar/src/public/index.ts
  packages/calendar/src/public/operations.ts
  packages/domain/src/index.ts
  packages/domain/src/internal/allocationReporter.ts
  packages/domain/src/internal/availabilityCalculator.ts
  packages/domain/src/internal/priorityScorer.ts
  packages/domain/src/internal/shuffleEngine.ts
  packages/domain/src/internal/slotBuilder.ts
  packages/domain/src/internal/taskDistributor.ts
  packages/domain/src/internal/types.ts
  packages/domain/src/internal/validator.ts
  packages/domain/src/public/generateSchedule.ts
  packages/domain/src/public/index.ts
  packages/shared/src/constants/index.ts
  packages/shared/src/index.ts
  packages/shared/src/types/index.ts
  packages/ui/src/components/BottomSheet.tsx
  packages/ui/src/components/Button.tsx
  packages/ui/src/components/FAB.tsx
  packages/ui/src/components/Modal.tsx
  packages/ui/src/index.ts


Documentation:

╔══════════════════════════════════════════╗
║     Codebase — Documentation Report      ║
╚══════════════════════════════════════════╝

Generated: 2026-06-18T02:23:59.187Z

── Overview ──
  Total files:       104
  Markdown (.md):    95
  JSON:              5
  YAML:              4
  Text (.txt):       0
  Total headings:    1828
  Total code blocks: 588
  Total list items:  1701

── Code Block Languages ──
  text                 444
  ts                   58
  json                 46
  tsx                  17
  (none)               11
  css                  4
  yaml                 4
  bash                 2
  http                 1
  mermaid              1

── Duplicate Headings (250) ──
  "role" — 6x
  "inputs" — 7x
  "responsibilities" — 12x
  "workflow" — 12x
  "return format" — 2x
  "constraints" — 13x
  "task rules" — 2x
  "dependency rules" — 2x
  "parallelization rules" — 3x
  "output" — 4x
  "retry limit (failure escalation)" — 4x
  "1. review assigned tasks" — 3x
  "2. review relevant code" — 2x
  "3. implement solution" — 2x
  "4. review changes" — 2x
  ... and 235 more

── All Headings (1075) ──
  planning analyst agent                        .opencode/agents/00-planning-agent.md
  role                                          .opencode/agents/00-planning-agent.md
  inputs                                        .opencode/agents/00-planning-agent.md
  responsibilities                              .opencode/agents/00-planning-agent.md
  workflow                                      .opencode/agents/00-planning-agent.md
  1. analyze request                            .opencode/agents/00-planning-agent.md
  2. review design documents (if chained after solution designer) .opencode/agents/00-planning-agent.md
  3. explore the codebase                       .opencode/agents/00-planning-agent.md
  4. analyze feasibility                        .opencode/agents/00-planning-agent.md
  5. analyze impact                             .opencode/agents/00-planning-agent.md
  6. analyze risks                              .opencode/agents/00-planning-agent.md
  7. compare approaches (independent flow only) .opencode/agents/00-planning-agent.md
  8. approval loop                              .opencode/agents/00-planning-agent.md
  9. create planning documents                  .opencode/agents/00-planning-agent.md
  10. update pipeline                           .opencode/agents/00-planning-agent.md
  planning rules                                .opencode/agents/00-planning-agent.md
  return format                                 .opencode/agents/00-planning-agent.md
  constraints                                   .opencode/agents/00-planning-agent.md
  solution designer agent                       .opencode/agents/01-solution-designer.md
  prohibited inputs                             .opencode/agents/01-solution-designer.md
  1. understand the request                     .opencode/agents/01-solution-designer.md
  2. map relevant documentation                 .opencode/agents/01-solution-designer.md
  3. research approaches                        .opencode/agents/01-solution-designer.md
  4. present options                            .opencode/agents/01-solution-designer.md
  5. collaborative loop                         .opencode/agents/01-solution-designer.md
  6. create design documents                    .opencode/agents/01-solution-designer.md
  7. create design index                        .opencode/agents/01-solution-designer.md
  8. update pipeline                            .opencode/agents/01-solution-designer.md
  downstream validation                         .opencode/agents/01-solution-designer.md
  design document rules                         .opencode/agents/01-solution-designer.md
  ... and 1045 more

── Files Scanned ──
  .opencode/INDEX.md  [13 headings, 0 code blocks]
  .opencode/OPENCODE_PLUGINS.md  [21 headings, 10 code blocks]
  .opencode/agents/00-planning-agent.md  [18 headings, 0 code blocks]
  .opencode/agents/01-solution-designer.md  [18 headings, 4 code blocks]
  .opencode/agents/02-tech-lead.md  [22 headings, 0 code blocks]
  .opencode/agents/03-senior-frontend.md  [20 headings, 0 code blocks]
  .opencode/agents/04-senior-backend.md  [21 headings, 0 code blocks]
  .opencode/agents/05-qa-reviewer.md  [19 headings, 0 code blocks]
  .opencode/architecture/architecture.md  [44 headings, 10 code blocks]
  .opencode/architecture/canonical-data-model.md  [45 headings, 22 code blocks]
  .opencode/architecture/commit-pattern.md  [6 headings, 2 code blocks]
  .opencode/architecture/docs/adrs/ADR-001-google-calendar-source-of-truth.md  [8 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-002-no-database.md  [8 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-003-local-storage.md  [9 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-004-dedicated-calendar.md  [10 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-005-30-minute-slots.md  [8 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-006-stateless-backend.md  [9 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-007-preview-before-save.md  [8 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-008-future-only-recalculation.md  [8 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-009-google-calendar-wins-conflicts.md  [8 headings, 0 code blocks]
  .opencode/architecture/docs/backend/api-specification.md  [48 headings, 32 code blocks]
  .opencode/architecture/docs/backend/references/api-endpoints.md  [88 headings, 38 code blocks]
  .opencode/architecture/docs/deployment-strategy.md  [16 headings, 7 code blocks]
  .opencode/architecture/docs/design-system.md  [20 headings, 5 code blocks]
  .opencode/architecture/docs/error-handling-strategy.md  [17 headings, 3 code blocks]
  .opencode/architecture/docs/feature/accessibility.md  [12 headings, 1 code blocks]
  .opencode/architecture/docs/feature/allocation-failure-handling.md  [11 headings, 3 code blocks]
  .opencode/architecture/docs/feature/blocked-slot-management.md  [15 headings, 1 code blocks]
  .opencode/architecture/docs/feature/calendar-navigation.md  [11 headings, 2 code blocks]
  .opencode/architecture/docs/feature/calendar-sync-refresh.md  [11 headings, 3 code blocks]
  .opencode/architecture/docs/feature/completion-flow.md  [11 headings, 2 code blocks]
  .opencode/architecture/docs/feature/conflict-handling.md  [10 headings, 1 code blocks]
  .opencode/architecture/docs/feature/dedicated-calendar-setup.md  [12 headings, 1 code blocks]
  .opencode/architecture/docs/feature/design-system-implementation.md  [5 headings, 0 code blocks]
  .opencode/architecture/docs/feature/error-handling-and-retry.md  [5 headings, 0 code blocks]
  .opencode/architecture/docs/feature/future-features-roadmap.md  [15 headings, 0 code blocks]
  .opencode/architecture/docs/feature/google-oauth-authentication.md  [12 headings, 2 code blocks]
  .opencode/architecture/docs/feature/index.md  [5 headings, 0 code blocks]
  .opencode/architecture/docs/feature/manual-calendar-editing.md  [13 headings, 1 code blocks]
  .opencode/architecture/docs/feature/mobile-experience.md  [11 headings, 0 code blocks]
  .opencode/architecture/docs/feature/references/workflow-details.md  [35 headings, 19 code blocks]
  .opencode/architecture/docs/feature/save-to-google-calendar.md  [13 headings, 4 code blocks]
  .opencode/architecture/docs/feature/schedule-generation-workflow.md  [41 headings, 19 code blocks]
  .opencode/architecture/docs/feature/schedule-preview.md  [13 headings, 2 code blocks]
  .opencode/architecture/docs/feature/settings-management.md  [13 headings, 1 code blocks]
  .opencode/architecture/docs/feature/task-management.md  [15 headings, 1 code blocks]
  .opencode/architecture/docs/feature/task-priority-and-weight.md  [41 headings, 26 code blocks]
  .opencode/architecture/docs/feature/unsaved-changes-protection.md  [10 headings, 2 code blocks]
  .opencode/architecture/docs/frontend/component-architecture.md  [56 headings, 19 code blocks]
  .opencode/architecture/docs/frontend/references/component-specs.md  [66 headings, 33 code blocks]
  .opencode/architecture/docs/logging-monitoring-strategy.md  [16 headings, 10 code blocks]
  .opencode/architecture/docs/security-architecture.md  [18 headings, 4 code blocks]
  .opencode/architecture/docs/testing-strategy.md  [13 headings, 1 code blocks]
  .opencode/architecture/domain-model.md  [47 headings, 11 code blocks]
  .opencode/architecture/event-classification.md  [36 headings, 13 code blocks]
  .opencode/architecture/generation-algorithm.md  [39 headings, 12 code blocks]
  .opencode/architecture/google-calendar-integration.md  [31 headings, 7 code blocks]
  .opencode/architecture/index.md  [10 headings, 0 code blocks]
  .opencode/architecture/monorepo-structure.md  [46 headings, 20 code blocks]
  .opencode/architecture/package-contracts.md  [30 headings, 12 code blocks]
  .opencode/architecture/references/algorithm-phases.md  [82 headings, 51 code blocks]
  .opencode/architecture/references/canonical-model-notes.md  [9 headings, 1 code blocks]
  .opencode/architecture/references/contract-enforcement.md  [13 headings, 6 code blocks]
  .opencode/architecture/references/domain-model-references.md  [28 headings, 21 code blocks]
  .opencode/architecture/references/event-details.md  [21 headings, 16 code blocks]
  .opencode/architecture/references/google-operations.md  [70 headings, 38 code blocks]
  .opencode/architecture/references/monorepo-details.md  [25 headings, 15 code blocks]
  .opencode/architecture/references/transformation-pipeline.md  [3 headings, 2 code blocks]
  .opencode/architecture/references/ux-states.md  [65 headings, 40 code blocks]
  .opencode/architecture/ux-flows.md  [55 headings, 15 code blocks]
  .opencode/commands/delivery-pipeline-new.md  [0 headings, 0 code blocks]
  .opencode/commands/delivery-pipeline-resume.md  [0 headings, 0 code blocks]
  .opencode/commands/doc-audit.md  [0 headings, 0 code blocks]
  .opencode/commands/learning-improvement.md  [0 headings, 0 code blocks]
  .opencode/docs-catalog.md  [8 headings, 0 code blocks]
  .opencode/package-lock.json  [keys: name, lockfileVersion, requires, packages]
  .opencode/package.json  [keys: scripts, dependencies, devDependencies]
  .opencode/pipeline.yaml  [keys: pipeline]
  .opencode/pnpm-lock.yaml  [keys: lockfileVersion, settings, importers, packages, snapshots]
  .opencode/pnpm-workspace.yaml  [keys: allowBuilds]
  .opencode/project-structure.md  [1 headings, 1 code blocks]
  .opencode/skills/codebase-analysis/SKILL.md  [13 headings, 0 code blocks]
  .opencode/skills/codebase-analysis/output/docs-report.json  [keys: generatedAt, mode, summary, files, errors, headingIndex, codeBlockLanguages]
  .opencode/skills/codebase-analysis/output/docs-report.md  [1 headings, 1 code blocks]
  .opencode/skills/codebase-analysis/output/implementation-report.json  [keys: generatedAt, mode, parser, summary, files, errors, dependencyCount, perPackage]
  .opencode/skills/codebase-analysis/output/implementation-report.md  [1 headings, 1 code blocks]
  .opencode/skills/codebase-analysis/scripts/package.json  [keys: name, type, private, dependencies]
  .opencode/skills/continuous-learning/SKILL.md  [4 headings, 0 code blocks]
  .opencode/skills/delivery-pipeline/SKILL.md  [31 headings, 0 code blocks]
  .opencode/skills/delivery-pipeline/references/agent-response-format.md  [2 headings, 2 code blocks]
  .opencode/skills/delivery-pipeline/references/constraints.md  [1 headings, 0 code blocks]
  .opencode/skills/delivery-pipeline/references/failure-recovery.md  [3 headings, 2 code blocks]
  .opencode/skills/delivery-pipeline/references/parallelization-rules.md  [3 headings, 2 code blocks]
  .opencode/skills/delivery-pipeline/references/task-tracking.md  [1 headings, 1 code blocks]
  .opencode/skills/doc-audit/SKILL.md  [11 headings, 0 code blocks]
  .opencode/skills/learning-improvement/SKILL.md  [5 headings, 0 code blocks]
  .opencode/skills/learning-improvement/references/stop-chain.md  [1 headings, 0 code blocks]
  .opencode/skills/session-save/SKILL.md  [7 headings, 2 code blocks]
  .opencode/skills/workflow-router/SKILL.md  [13 headings, 5 code blocks]
  .opencode/template/design-template.md  [29 headings, 0 code blocks]
  .opencode/template/pipeline-template.yaml  [keys: pipeline]
  .opencode/template/planning-template.md  [36 headings, 0 code blocks]
  .opencode/template/task-template.md  [26 headings, 0 code blocks]
  .opencode/template/variables.md  [0 headings, 0 code blocks]

```
