# Batch Handoff — [BATCH_ID]

> Durable file under `[PLAN_FOLDER_LOCATION]/references/`; update in place before STOP and after closeout. For planning-only closure without an active batch, reuse applicable fields at `references/planning-session-handoff.md` (or stable per-session suffix) as described in [planning-only checkpoint](../skills/delivery-pipeline/references/session-batches.md#planning-only-checkpoint-before-a-batch-starts); omit a batch ID rather than fabricating one. Do not put credentials, raw transcripts, or private connection strings here. Distinguish unknown from zero and skipped from passed.

## Identity and authorization

- Pipeline/context and batch state, close reason, current/next batch IDs, principal session ID (or unavailable + explicit fresh-session confirmation needed):
- User request, approvals/declines, outstanding decisions and remaining acceptance:
- Planning-only checkpoint (if applicable): approved task/index paths, proposed pending batch IDs and next planning/dispatch gate; no fabricated completed task batch:
- Branch/HEAD, tracked dirty files, untracked files, staged files (user-owned vs task-owned):

## Work and evidence

| Task / owner | Task artifact | Implementation status | QA scope/status | Runtime status / missing acceptance | feat SHA | docs SHA / pending reason |
|---|---|---|---|---|---|---|

- Exact validation commands, package, result/counts, skip/block reason, timestamp and last relevant edit; no stale pass as final evidence:
- Partial artifacts/diffs, uncommitted work, unresolved errors and retry/dispatch attempt counts:
- Early-stop carryover: original batch and unfinished task IDs (unstarted vs partial), archived assignment/history, `moved_to` destination pending batch for each ID, destination dependencies, exact partial evidence/next action and once-only assignment check; blocked batches retain IDs absent explicit replan:
- Dependencies, shared-file ownership/overlap merge plan; future batch IDs and pending tasks:

## Principal budget and closeout

- Observed principal input context (or unknown + reason), current provider/model, capacity source and effective `limits` from `read-context-budget`, observation metadata and current-session baseline including startup/design/planning/retries; per-task dispatch/context, condensed return, QA/correction, commit/state and closure estimates with size/uncertainty, proposed batch sum and effective `limits.dispatchReserve` (estimates are not measured telemetry; `.opencode/context-budget.json` defines policy ratios, caps and exact-model overrides, not universal limits):
- Documentation refresh: `INDEX.md` / `docs-catalog.md` / `project-structure.md` (updated or checked-no-change with reason):
- Checkpoints: active review; task commits reconciled; preliminary handoff; learning-improvement; continuous-learning approval/decline and application; session-save path; final handoff; final docs/state commit SHA or pending reason; read-back verified:
- STOP chain pending user approval and exact next question (if any):

## Resume instruction

- Next exact action, agent, task path and permitted commands (same `running` batch may resume after reconciliation and safe budget; `closing` resumes missing checkpoints only; a later pending batch needs a fresh confirmed session):
- Current blocker and prerequisites; commands are descriptive, never evidence of execution:
- New session user confirmation required if principal session IDs unavailable:
