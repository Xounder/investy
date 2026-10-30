# Commit Pattern

## Purpose

All commits in this repository must follow the pattern defined here. The file is referenced by `AGENTS.md`; it is mandatory reading before any commit and whenever a commit fails validation.

Commits happen **per task** for QA-approved implementation when the user has authorized commits. Code approval and full runtime acceptance are separate gates: committing reviewed code does not complete outstanding environment validation. Each task produces one implementation commit and a separate documentation commit when it changed `.opencode/` documentation.

## General Format

```text
<type>(<scope>): <subject>
```

- **type**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `perf`, `revert`.
- **scope**: workspace package or area — `web`, `api`, `domain`, `pipeline`, `docs`, `architecture`, or a `.opencode/` skill/area (`delivery-pipeline`, `workflow-router`, etc.).
- **subject**: imperative mood (e.g. "add", "fix", "remove"), lowercase, no trailing period, max 72 characters.

## Commit Timing

- Resolve commit authorization at workflow entry or resume. Authorization for per-task commits covers the current delivery scope; an implementation request alone is not authorization to commit.
- Once authorized, commit the reviewed implementation immediately after code QA approval, before dispatching another implementation task. Never accumulate approved tasks for a later batch.
- Never batch multiple tasks into one commit; each reviewed task scope gets its own commit.
- The orchestrator creates the commits and records the resulting SHAs in `pipeline.yaml` task metadata.
- If Docker, a database, or another external requirement prevents runtime validation, record the deferral in the task and commit body. Keep the task pending full acceptance; do not turn skipped checks into passes.
- If a commit cannot be created, record the reason in the existing task notes or concerns before continuing. Missing authorization and unvalidated code must not become silent commit omissions.

## Implementation Commit (one per task)

Format:

```text
feat(<feature>)[<TASK-XX>]: <subject>
```

- **`<feature>`** — the pipeline feature name, taken from `pipeline.yaml` `name` (the context). Example: `investy-dashboard`.
- **`<TASK-XX>`** — the task ID, e.g. `TASK-01`.
- **`<subject>`** — what the task implements, imperative mood, e.g. `add database`.

Example:

```text
feat(investy-dashboard)[TASK-01]: add database schema and repository
```

Optional body with context (why, approach, affected ADRs):

```text
feat(investy-dashboard)[TASK-01]: add database schema and repository

Implements the journal-store tables defined in ADR-005. Adds Drizzle
schema, migrations, and the position aggregation query used by V1.
```

## Documentation Commit (separate, when `.opencode/` changed)

When a task creates or modifies files under `.opencode/`, commit those files **separately** from the implementation:

Format:

```text
docs(<area>): <detailed description>
```

- **`<area>`** — the modified documentation area, e.g. `delivery-pipeline`, `workflow-router`, `architecture`, `agents`, `template`.
- **`<detailed description>`** — what changed and why, given the session context. May be longer than the implementation subject.

Always include a **body** with context and rationale when the change is non-trivial.

Example:

```text
docs(delivery-pipeline): commit per finalized task with feat(...)[TASK-XX] and separate docs commits

Adds a per-task commit step after QA approval so each task lands in
history independently. Introduces the feat(<feature>)[TASK-XX] format
and the separate docs(delivery-pipeline) commit for .opencode changes.
```

## Scopes

Allowed scopes:

- Workspace packages: `web`, `api`, `domain`.
- Pipeline and documentation areas: `pipeline`, `docs`, `architecture`, `delivery-pipeline`, `workflow-router`.
- Feature scope (implementation commits): the `pipeline.yaml` `name`, e.g. `investy-dashboard`.

## Examples

```text
feat(investy-dashboard)[TASK-03]: add quote override endpoint
docs(delivery-pipeline): add per-task commit rule with feat(...)[TASK-XX] format
chore(web): upgrade Tailwind to v4
```

## Validation Rules

- Commit messages are written in **English**.
- `type` must be one of the allowed types.
- `scope` must be a known package, area, or the pipeline feature name.
- Implementation commits MUST reference the task ID in the subject: `[TASK-XX]`.
- The subject must not start with a capital letter and must not end with a period.
- Avoid merge commit noise; use rebase or squash to keep history linear.
- A commit that fails validation must be fixed and re-created. Do not amend a failed commit; create a new corrected commit.

## Rules of Thumb

- Only commit reviewed files belonging to one task scope: implementation commit = task files; docs commit = `.opencode/` files changed by the task. Preserve unrelated user staging.
- Never commit secrets, tokens, or local configuration.
- Do not commit build output, `node_modules`, or generated artifacts.
- Never re-commit previously committed task work.
- Reference the working product (Investy) and any related ADR or feature in the body when relevant.
