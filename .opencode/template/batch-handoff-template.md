# Batch Handoff — [BATCH_ID]

> Durable file under `[PLAN_FOLDER_LOCATION]/references/`; update in place before STOP and after closeout. Do not put credentials, raw transcripts, or private connection strings here. Distinguish unknown from zero and skipped from passed.

## Identity and authorization

- Pipeline/context and batch state, close reason, current/next batch IDs, principal session ID (or unavailable + explicit fresh-session confirmation needed):
- User request, approvals/declines, outstanding decisions and remaining acceptance:
- Branch/HEAD, tracked dirty files, untracked files, staged files (user-owned vs task-owned):

## Work and evidence

| Task / owner | Task artifact | Implementation status | QA scope/status | Runtime status / missing acceptance | feat SHA | docs SHA / pending reason |
|---|---|---|---|---|---|---|

- Exact validation commands, package, result/counts, skip/block reason, timestamp and last relevant edit; no stale pass as final evidence:
- Partial artifacts/diffs, uncommitted work, unresolved errors and retry/dispatch attempt counts:
- Dependencies, shared-file ownership/overlap merge plan; future batch IDs and pending tasks:

## Principal budget and closeout

- Observed input context (or unknown + reason), observation metadata, dispatch estimate and reserve:
- Documentation refresh: `INDEX.md` / `docs-catalog.md` / `project-structure.md` (updated or checked-no-change with reason):
- Checkpoints: active review; task commits reconciled; preliminary handoff; learning-improvement; continuous-learning approval/decline and application; session-save path; final handoff; final docs/state commit SHA or pending reason; read-back verified:
- STOP chain pending user approval and exact next question (if any):

## Resume instruction

- Next exact action, agent, task path and permitted commands (do not dispatch until fresh-session and budget gates are satisfied):
- Current blocker and prerequisites; commands are descriptive, never evidence of execution:
- New session user confirmation required if principal session IDs unavailable:
