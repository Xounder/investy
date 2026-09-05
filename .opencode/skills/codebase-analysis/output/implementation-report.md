# Codebase Analysis — Implementation

Generated: 2026-06-18T02:23:59.157Z

```

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

```
