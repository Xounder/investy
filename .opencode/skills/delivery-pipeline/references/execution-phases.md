# Execution Phases

Detailed phase execution for the Delivery Pipeline. Referenced from `delivery-pipeline/SKILL.md`.

## Architecture Initialization Flow

Runs when the **architecture documentation set** is missing or incomplete:

- No app has been bootstrapped — `[ARCHITECTURE_ENTRY_FILE]` (`.opencode/architecture/architecture.md`) does not exist
- A codebase exists but the supporting docs are missing — `[DOCS_CATALOG_FILE]` (`.opencode/docs-catalog.md`), `[PROJECT_STRUCTURE_FILE]` (`.opencode/project-structure.md`), or the INDEX.md `# Architecture` section

1. Dispatch the **Architecture Initializer** as a primary agent — invoke using the agent's full workflow directly, never via `task` with `subagent_type: general`.
2. Present product vision, stack, and architecture options to the user.
3. Wait for semantic approval.
4. Repeat the design loop until approved.
5. The Architecture Initializer generates the physical architecture documentation:
   - `[ARCHITECTURE_FOLDER_LOCATION]` — `index.md`, `architecture.md`, `architecture-folder-schema.md`, `docs/adrs/ADR-001-*.md` (+ follow-up ADRs), folder skeleton (`references/`, `docs/backend/`, `docs/feature/`, `docs/frontend/`)
   - Missing supporting docs — `[DOCS_CATALOG_FILE]`, `[PROJECT_STRUCTURE_FILE]`
   - INDEX.md `# Architecture` section seeded with the created files; `TODO` entries for any pending file
6. Orchestrator MUST verify the files were physically created before proceeding, and that any uncreated required file is marked `TODO` in INDEX.md. If files are missing without a TODO entry, re-dispatch the Architecture Initializer with the file creation requirement.
7. Record the architecture summary (stack, principles, key decisions, file paths) in `pipeline.yaml` `handoff` and pass it downstream to the Solution Designer / Planning Analyst.
8. Update pipeline (step `architecture-initializer` → `completed`).
9. Proceed to Step 1 (Route Request).

Architecture base files must not be created before approval.

This flow runs once per app, plus the backfill run that completes a partial documentation set. If the set is already complete, skip it and go directly to Step 1.

## Step 1 - Route Request

Invoke:

```text
workflow-router
```

The router determines whether the request should be handled by:

- Solution Designer
- Planning Analyst
- Tech Lead

## Solution Designer Flow

When Solution Designer is selected:

1. Execute Solution Designer.
2. Present approaches to the user.
3. Wait for semantic approval.
4. Repeat design loop until approved.
5. Generate design documents.
6. Update pipeline.

If a codebase exists:

  7. Execute Planning Analyst (pass design_summary and design-docs/ path as context).
  8. Present planning analysis to the user.
  9. Wait for semantic approval.
  10. Repeat planning loop until approved.
  11. Generate planning documents.
  12. Update pipeline.
  13. Execute Tech Lead.

If no codebase exists:

  7. Execute Tech Lead directly.

Design documents must not be created before approval.
Planning documents must not be created before approval.

## Planning Flow

When Planning Analyst is selected:

1. Execute Planning Analyst as a primary agent — invoke using the agent's full workflow directly (not via `task` with `subagent_type`).
2. Present approaches to the user.
3. Wait for semantic approval.
4. Repeat planning loop until approved.
5. Planning Analyst generates planning documents (index.md, feasibility.md, impact-analysis.md, risks.md) in `[PLAN_FOLDER_LOCATION]`.
6. Orchestrator MUST verify planning files were physically created before proceeding. If files are missing, re-dispatch the Planning Analyst with the file creation requirement.
7. Update pipeline.
8. Execute Tech Lead.

Planning documents must not be created before approval.

## Tech Lead Flow

Execute Tech Lead.

Expected outputs:

- Task files
- Task dependencies
- Ownership assignments
- Execution order
- Bounded session batch proposal for all remaining tasks (see [session-batches.md](session-batches.md)); orchestrator persists the entire plan, including pending future batches, before implementation.

Update pipeline.

## Parallel Development Phase

Read task ownership and dependencies.

Tasks without unmet dependencies **within the current batch** may execute after the principal-context dispatch gate. Future-batch tasks never execute in this principal session after closeout.

The orchestrator must maximize parallel execution whenever dependencies allow.

## Parallel Execution Phase

Dispatch **multiple** Senior Frontend/Backend agents simultaneously when independent tasks are available **within the current batch and the budget allows all dispatch/report costs**. Do not limit to one agent per role — if 3 frontend tasks are independent, create 3 Senior Frontend agents in parallel. Each agent receives exactly one task. Record dispatch/return/QA observations per [session-batches.md](session-batches.md#principal-context-budget-guidance-not-a-hard-limit).

Pass:

- Assigned task (one per agent)
- Acceptance criteria
- Relevant context
- Dependency information
- Task file path for exact step-by-step code
- Standard response format requirement — instruct the agent to return using the [standard agent response format](agent-response-format.md)

Update pipeline after every completed task.

**Important: one agent per task** — never assign multiple tasks to a single agent if they can run in parallel.

## Concurrent File Modification Prevention

When multiple tasks modify the same file, assign them sequentially or use a merge strategy. Review task file lists for overlaps before parallel dispatch. If overlap is detected, choose one of:

1. **Sequence**: Run tasks that touch the same file sequentially, in a logical order (e.g., type changes first, then component changes, then layout changes).
2. **Parallel with non-overlapping sections**: If tasks affect clearly separate sections of the same file (different functions, different JSX branches), dispatch in parallel and instruct each agent to only modify its designated lines.
3. **Merge agent**: When 3+ tasks overlap on the same file, consider dispatching a single agent with all related tasks to minimize merge conflicts.

The Tech Lead should flag file overlaps in the task metadata so the orchestrator can plan the dispatch order early.

## QA Phase

Execute:

- QA Frontend
- QA Backend

in parallel whenever possible.

Provide:

- Original task
- Acceptance criteria
- Relevant implementation context
- Git diff for files modified by the reviewed task

QA validates implementation against requirements.

Exactly one QA Frontend instance reviews frontend work.

Exactly one QA Backend instance reviews backend work.

## Corrections Loop

If QA returns:

```text
Corrections Needed
```

The orchestrator must:

1. Update pipeline.
2. Send feedback to the responsible implementation agent.
3. Re-execute implementation.
4. Re-execute QA.

Repeat until approved.

## Task Commit

Apply the authorization and code-QA timing rules in the [commit pattern](../../../architecture/commit-pattern.md) at every QA handoff; do not wait for pipeline completion.

The orchestrator creates the commits following the [commit pattern](../../../architecture/commit-pattern.md):

1. **Implementation commit** — the task's files, one commit per task:
   ```text
   feat(<feature>)[<TASK-XX>]: <subject>
   ```
   `<feature>` is the `pipeline.yaml` `name`; `<TASK-XX>` is the task ID.
2. **Documentation commit** — if the task created or modified files under `.opencode/`, commit them **separately**:
   ```text
   docs(<area>): <detailed description>
   ```
   Include a body with session context and rationale for non-trivial changes.

Record both commit SHAs in the task metadata in `pipeline.yaml` as `feat_commit` and `docs_commit`.

### Commit Checkpoint Before the Next Dispatch

Before dispatching another implementation agent, verify that the approved task's authorized commits exist and their SHAs are recorded. A successful commit command without state persistence does not close this checkpoint.

If authorization is absent or Git/checks prevent a commit, record the specific pending reason in task notes or concerns. Carry an explicit pending-commit handoff rather than silently collecting more approved work.

Code/config/scaffold-only QA can support an authorized implementation commit while runtime acceptance remains deferred. Preserve the task's incomplete validation status and the outstanding environment checks; the commit does not satisfy the Completion phase below.

Only the reviewed task's files are staged. Preserve unrelated user staging and never re-commit previously committed task work.

## Completion

Workflow completes when:

- All tasks are completed
- All QA reviews are approved
- No pending work remains

Upon completion, the orchestrator MUST:

1. Close the final bounded batch with the [idempotent closeout procedure](session-batches.md#closeout-state-machine-resume-each-missing-checkpoint-only); its STOP chain runs once, honoring the continuous-learning approval gate.
2. Only after all tasks' full QA and runtime acceptance (no skips/deferred checks treated as passes), update `pipeline.yaml` status to `completed` with final concerns/history. Commit authorized remaining non-task docs/state **after** the chain per [commit pattern](../../../architecture/commit-pattern.md), never re-commit task work.
3. Verify durable handoff and final state before reporting completion; blocked/partial pipelines remain in progress.
