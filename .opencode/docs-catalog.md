# Docs Catalog

Catalog of all `.md` files in `.opencode/` with content description and when to modify them. Used by the `continuous-learning` skill to quickly identify which files to adjust based on each session's learnings.

---

## Entry Points

| File | Content | When to modify |
|---|---|---|
| `AGENTS.md` | Operational rules, execution conventions, project boundary | Rules or conventions change |
| `INDEX.md` | Central guide — links to all architecture docs, constraints, pipeline modes | New docs created; architecture changes; pipeline modes change |

---

## Agents

| File | Content | When to modify |
|---|---|---|
| `agents/00-architecture-initializer.md` | Architecture Initializer — bootstraps the architecture documentation set (architecture folder with index.md, architecture.md, schema, ADRs; docs-catalog.md; project-structure.md) when no app exists or when a codebase lacks the set | Architecture documentation set changes; pipeline flow adjustments |
| `agents/00-planning-agent.md` | Planning Analyst — feasibility, risk, impact analysis, on-demand planning docs for PM | New analysis types; planning output format changes |
| `agents/01-solution-designer.md` | Solution Designer instructions — collaborative design analysis, trade-off evaluation, web research, design document creation in design-docs/ | SD flow changes; new artifact types |
| `agents/02-tech-lead.md` | TL instructions — decomposition, per-task cost/uncertainty and all pending session scopes, one .md per task | Task format, context sizing or allocation changes |
| `agents/03-senior-frontend.md` | Frontend agent instructions | Frontend conventions change |
| `agents/04-senior-backend.md` | Backend agent instructions | Backend conventions change |
| `agents/05-qa-reviewer.md` | QA agent instructions — pipeline.yaml, frontend/backend verification, checklist | QA checklist changes; new patterns |
| `agents/shared/implementation-rules.md` | Shared implementation rules (architecture, money/data rules, code quality, testing) — referenced by Senior Frontend and Senior Backend | Shared implementation rules change |
| `agents/shared/subagent-common.md` | Shared subagent blocks — standard return format and retry limit — referenced by all agents to avoid prompt duplication | Return format or retry limit policy changes |


---

## Skills

| File | Content | When to modify |
|---|---|---|
| `skills/delivery-pipeline/SKILL.md` | Orchestrator — Full Pipeline + Direct Task Mode | Pipeline flow changes; new steps; new rules |
| `skills/delivery-pipeline/references/parallelization-rules.md` | Rules for parallel task execution | Parallelization rules change |
| `skills/delivery-pipeline/references/failure-recovery.md` | Failure recovery, evidence reconciliation and same-running-batch retry gates | Recovery logic changes |
| `skills/delivery-pipeline/references/task-tracking.md` | Task tracking in pipeline state | Tracking format changes |
| `skills/delivery-pipeline/references/agent-response-format.md` | Standard agent response format | Response format changes |
| `skills/delivery-pipeline/references/constraints.md` | Pipeline constraint list | Constraint rules change |
| `skills/delivery-pipeline/references/execution-phases.md` | Phase execution details — architecture init, routing, planning, tech lead, parallel execution, QA, corrections, task commit, completion | Phase flows change |
| `skills/delivery-pipeline/references/session-batches.md` | Principal-session scope slicing, budget guidance, early-stop carryover, closeout checkpoints and idempotent resume | Batch sizing/closeout/recovery rules change |
| `skills/workflow-router/SKILL.md` | Request classification and workflow routing | Classification logic or routing changes |
| `skills/learning-improvement/SKILL.md` | Session evaluation (step 1/3 of STOP) | Evaluation format changes; chaining enforcement |
| `skills/continuous-learning/SKILL.md` | Doc update proposal (step 2/3 of STOP) | Scope of analyzed docs changes |
| `skills/session-save/SKILL.md` | Session persistence (step 3/3 of STOP) | File format changes |
| `skills/doc-audit/SKILL.md` | Audits .md files for duplicates and intra-file prompt duplication (excludes /plan folder) | New audit rules; file similarity detection changes |
| `skills/learning-improvement/references/stop-chain.md` | STOP hook chain definition — 3 skills in sequence | Chain order or skill names change |
| `skills/codebase-analysis/SKILL.md` | Scans all TS/TSX files with tree-sitter — extracts imports, exports, declarations, React components, dependency maps | New scan targets; grammar changes; output format changes |
| `skills/codebase-analysis/output/` (local, Git-ignored) | Generated structural and documentation analysis reports; not versioned source | Regenerate with the codebase-analysis skill |

---

## Templates

| File | Content | When to modify |
|---|---|---|
| `template/architecture-template.md` | Architecture base document template — overview, principles, stack, decisions, success criteria | Architecture template format changes |
| `template/design-template.md` | Design document template — options, trade-offs, decision, impact, risks | Design template format changes |
| `template/task-template.md` | Task artifact template with deliverable boundary, batch scope, cost uncertainty and validation closure | Task format or scope estimates change |
| `template/planning-template.md` | Planning document template | Planning format changes |
| `template/pipeline-template.yaml` | Pipeline state skeleton and session batch fields | State schema changes |
| `template/batch-handoff-template.md` | Durable planning checkpoint, budget baseline, early-stop carryover and resume evidence outside retained sessions | Batch recovery fields change |
| `template/variables.md` | Shared template variables | Variable set changes |

---

## Architecture

| File | Content | When to modify |
|---|---|---|
| `architecture/index.md` | Architecture entry point — document list, ADR summary | Architecture changes |
| `architecture/architecture.md` | System architecture, principles, stack, key decisions, success criteria | Architecture decisions change |
| `architecture/architecture-folder-schema.md` | Folder purpose map | Folder structure changes |
| `architecture/commit-pattern.md` | Commit message convention — per-task `feat(<feature>)[TASK-XX]` commits and separate `docs(<area>)` commits | Commit rules or formats change |
| `architecture/docs/adrs/` | Architecture Decision Records (ADR-001 to ADR-011) | New ADRs accepted |
| `architecture/docs/adrs/ADR-011-docker-first-runtime.md` | Docker-first main PostgreSQL/API/worker/web and isolated E2E; managed hosting option retained | Docker runtime/hosting decision changes |

---

## Commands

| File | Content | When to modify |
|---|---|---|
| `commands/delivery-pipeline-new.md` | Start new delivery workflow | Pipeline flow changes |
| `commands/delivery-pipeline-resume.md` | Resume delivery workflow | Pipeline recovery changes |
| `opencode.jsonc` | Explicit colon-named `/delivery-pipeline:resume` and `/delivery-pipeline:new` registrations; Markdown filenames register their own hyphenated aliases | Slash command names change |
| `commands/doc-audit.md` | `/doc-audit` command to run doc audit skill | Audit flow changes; new detection rules |
| `commands/learning-improvement.md` | `/learning-improvement` STOP hook command | Learning evaluation changes |

---

## Support

| File | Content | When to modify |
|---|---|---|
| `OPENCODE_PLUGINS.md` | Plugin development guide for OpenCode | Plugin patterns or API changes |
| `tools/save-session.ts` | Session save custom tool — creates session file, keeps 2 most recent | Tool logic changes; retention policy changes |
| `tools/create-folder-structure.ts` | Folder creation tool — creates `design-docs/`, `planning/`, `tasks/` for a pipeline context | Folder structure changes; new pipeline contexts |
| `tools/get-git-diff.ts` | Git diff tool — returns diff between two refs with optional path filter | Diff logic changes |
| `tools/read-pipeline-state.ts` | Pipeline state reader — reads `pipeline.yaml` fields via dot-separated paths | Pipeline YAML structure changes |
| `tools/read-context-budget.ts` | Host SDK caller-session snapshot and configured current-model capacity via `config.providers`; optional loopback override, 20 recent messages, shared 5-second async deadline; invoke from principal after restart | Context budget tool interface changes |
| `plugins/context-budget.plugin.ts` | Registers host SDK transport for the current directory/worktree; no duplicate tool registration | Host plugin/client contract changes |
| `lib/context-budget-client.ts` | Project-scoped client registry with disposal guard | Host client lifecycle changes |
| `context-budget.json` | Auto policy ratios/caps and optional exact provider/model usable-input overrides; missing/invalid policy stops new work | Budget policy changes |
| `lib/context-budget.ts` | Validates config, resolves configured-model usable input (context minus max output and optional input bound), scales effective limits and validates same-model completed snapshot with 120-second freshness; caller identity is not principal identity | Budget semantics or limits change |
| `tests/read-context-budget.test.ts` | Tool/helper behavior tests, including explicitly configured historical boundary scenarios | Context-budget behavior changes |
| `tests/context-budget-config.test.ts` | Configuration validation, alternate policy and current default boundary regression tests | Context-budget policy changes |
| `tests/context-budget-invalid-tool.test.ts` | Invalid config prevents SDK requests and returns unknown | Context-budget failure policy changes |
| `tests/context-budget-host.test.ts` | Real SDK custom-fetch regression tests; not live host-discovery evidence | Context-budget host transport changes |
| `tests/context-budget-manual-host.test.ts` | Real SDK custom-fetch exact-model manual fallback, metadata failure/deadline and abort regressions; not live discovery | Context-budget fallback contract changes |
| `tools/resolve-template.ts` | Template renderer — resolves `[VARIABLES]` from variables.md with pipeline context | Variable definitions or template paths change |
| `tools/run-package-command.ts` | Package command runner — runs build/lint/typecheck/test in a workspace subpackage | New commands added |
| `project-structure.md` | Project structure map | Important folders/files change |
| `docs-catalog.md` | This file — doc catalog | New .md file created in .opencode/ |

## Generated Planning Artifacts

| File | Content | When to modify |
|---|---|---|
| `plan/investy-dashboard/references/batch-BATCH-01-handoff.md` | Durable legacy TASK-19 runtime blocker/commit/validation and next-action handoff; other batch handoffs created on entry | Batch scope or observed recovery evidence changes |
