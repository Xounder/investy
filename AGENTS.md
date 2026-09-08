# AGENTS.md

**Startup ritual (run in every new session):**

Read:

```text
.opencode/INDEX.md
```

This is the project's single entry point for architecture, workflow, agents, skills, templates, and documentation navigation.

## Purpose

This file contains operational rules and execution conventions.

Architecture, workflow, agent responsibilities, templates, and project documentation are referenced through:

```text
.opencode/INDEX.md
```

## Project Profile

**Investy** is a multi-user investment portfolio dashboard for the Brazilian retail market. It consolidates holdings across brokers and asset classes, values positions from live market quotes, tracks dividends, and reports performance over time against CDI, IBOV, IFIX, and S&P 500.

### Repository Layout (pnpm monorepo)

```text
Investy/
├── apps/
│   ├── web/        # React 18 + Vite SPA
│   └── api/        # Hono API, market-data proxy, and worker entrypoint
└── packages/
    └── domain/     # Pure TypeScript, shared domain types + math
```

- Dependency direction: `web` and the worker depend on `domain`; `api` depends on `domain`; `domain` depends on nothing internal (ADR-002).
- The worker runs as a second process entrypoint inside `apps/api` (single deploy unit).
- Package validation commands run through the `run-package-command` tool with package paths `apps/web`, `apps/api`, and `packages/domain`.

### Technology Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + Vite + TypeScript; TanStack Query + Zustand |
| Styling / UI | Tailwind CSS v4 on DocuForge tokens; Recharts |
| Backend | Node.js + Hono + TypeScript; zod validation |
| Storage | PostgreSQL (managed) + Drizzle ORM |
| Auth | Email/password + httpOnly cookie sessions (OAuth2-ready) |
| Tests | Vitest (unit/domain/API) + Playwright (E2E) |

### Domain Conventions

- **Money is integer cents** (`BIGINT`) everywhere — never floats (ADR-004).
- **Transaction journal is the source of truth**: every position derives from journal entries (buy, sell, dividend, split, adjustment). Manual entry, CSV/JSON import, and B3 nota import always produce journal entries (ADR-005).
- **Multi-user isolation**: every record is scoped to its owner; the API enforces ownership on every query; cross-user access is forbidden and tested (ADR-006).
- **No secrets in the browser**: provider keys, database credentials, and session secrets exist only on the server (ADR-008, ADR-010).
- **Provider-agnostic market data**: prices flow through a server-side proxy with a provider interface, TTL cache, manual override, and last-known-good fallback (ADR-003).
- **UI strings are in pt-BR**; currency and number formatting via `Intl` (`pt-BR`, `BRL`).

## Core Rules

### Project Boundary

Never:

* Read files outside the project root
* Write files outside the project root
* Request files outside the project root

All operations must remain inside the repository.

### Documentation Language

All project documentation must be written in English.

Applies to:

* Markdown
* YAML
* JSON
* Source code comments
* Generated documentation

### File Size Limit

No file may exceed:

```text
400 lines
```

When a documentation file exceeds this limit:

1. Split the content into smaller files inside a dedicated folder `references`
2. Replace the oversized content in the original file with references to the new files
3. Update all references and navigation paths
4. Preserve the original document as the entry point whenever possible

Exception: `.opencode/plan/` files are not subject to this limit. Generated planning, design, and task artifacts may exceed 400 lines.

### Commit Convention

Before making any commit, read:

```text
.opencode/architecture/commit-pattern.md
```

All commits must follow the pattern defined there. Implementation commits use `feat(<feature>)[<TASK-XX>]: <subject>` where `<feature>` is the `pipeline.yaml` name; `.opencode/` changes land in a separate `docs(<area>): <subject>` commit. Each finalized task is committed on its own — two commits when `.opencode/` was changed. If a commit fails validation, consult the file again before retrying.

### Standalone Agent Invocation

When the user initiates a design discussion, feature exploration, planning analysis, or open-ended request in direct conversation, invoke the corresponding agent directly (Solution Designer, Planning Analyst, etc.) as a standalone agent — do not route through the delivery-pipeline skill.

## Process Handling

Never:

* Check running processes
* Kill running processes
* Manage operating system processes directly

If execution fails because of a running process:

* Report the error
* Continue following pipeline rules

## Validation

When application execution is required:

1. Start application
2. Execute validation
3. Stop application

Applications must not remain running after validation.

## Error Reporting

All agents must report using the [standard agent response format](.opencode/skills/delivery-pipeline/references/agent-response-format.md).

## Parallel Execution

Safe parallel execution should always be preferred.

Examples:

```text
Frontend + Backend
```

```text
QA Frontend + QA Backend
```

provided dependencies are satisfied.

## Task Completion

Work is not complete until:

* Implementation is complete
* Validation is complete
* QA approval is complete
* Pipeline state is updated

Partial completion is not considered completion.

### Task Completion Commit

Commit as soon as a task is finalized (QA approval), following the [commit pattern](.opencode/architecture/commit-pattern.md). Each finalized task produces:

1. One `feat(<feature>)[TASK-XX]: <subject>` commit for the implementation files
2. One separate `docs(<area>): <subject>` commit when the task modified `.opencode/` files

At the end of the delivery-pipeline, after completion and session saving (STOP chain: `learning-improvement` → `continuous-learning` → `session-save`), commit the remaining non-task changes (e.g., pipeline state) following the same pattern — never re-commit already-committed task work.

## Mandatory Codebase Discovery

Before reading, analyzing, modifying, reviewing, or searching for files, execute the `codebase-analysis` skill once at the start of the task.

Do not inspect any files before the skill completes.

This requirement applies to every new task, even when the requested file path is already known.

> **Exception:** Pipeline subagents (Senior Frontend, Senior Backend, QA Frontend, QA Backend) dispatched by the delivery-pipeline orchestrator MUST NOT run `codebase-analysis`. The orchestrator provides all required context (file paths, code snippets, dependency info). Running the skill again is wasteful and may interfere with the pipeline flow.

### Codebase Analysis Mode

Use when the task involves:

* Source code
* Architecture
* Refactoring
* Bug fixing
* Feature implementation
* Testing
* Dependency analysis

Required action:

```text
Run skill: codebase-analysis
Mode: implementation
```

The skill must perform the repository structural analysis workflow and collect code-level context before any file inspection.

### Documentation Analysis Mode

Use when the task involves:

* Markdown documentation
* AGENTS.md
* INDEX.md
* Templates
* Workflows
* Operational guides
* Documentation refactoring

Required action:

```text
Run skill: codebase-analysis
Mode: docs
```

The skill must perform the documentation discovery workflow and build a documentation map before reading individual documents.

### Enforcement

Agents must not:

* Start file exploration manually
* Read multiple files blindly
* Perform repository-wide searches before running the skill

The `codebase-analysis` skill is always the first discovery step.

Only after the skill completes may the agent inspect specific files, documentation, or implementation details.

## Agent rules

### Process handling
- **Never check if a process is running** (no Get-Process, ps, etc.)
- **Never kill/taskkill processes yourself** — just run `pnpm` commands as-is
- If a port is already in use, report the error to the orchestrator — do not resolve it

### Tool preference for file operations
Prefer the **dedicated tools** (`grep`, `glob`, `read`, `edit`, `write`) for file searching and content operations over `bash`/PowerShell. Use `bash` only as a last resort when the dedicated tools cannot accomplish the task.

### Tool limitations
- `glob` ignores dot-directories (e.g. `.opencode/plan/`). To verify generated pipeline files, use `read` on the directory instead.
- `get-git-diff` compares refs only and misses untracked/unstaged files. When reviewing new files, read them directly from disk.

### Custom tools
See [INDEX.md](.opencode/INDEX.md#tools) for the full list of custom tools in `tools/`. Agents should use these tools directly instead of implementing equivalent logic via bash.

### Bash command restrictions
The shell environment rejects the following patterns:
- **Chained commands**: `&&`, `||`, `;`, `|`, backticks (`\``), `$()`, `${}`, literal newlines — each command must be a single statement
- **Unrecognized commands**: only the commands documented in this file (pnpm, git, docker, curl, ls, cat, etc.) and a few utility commands are accepted
- **Node/tsx execution**: scripts must be inside the project directory with `.ts`, `.js`, or `.tsx` extension; the script path is resolved from the project root (not from any `workdir` override); flags like `-e`, `--eval`, `--require` are blocked
- **File operations**: all file paths must resolve inside the project root
- **pnpm**: flags/filters (e.g., `--filter`, `--exec`) blocked — use `run-package-command` tool for `build`, `lint`, `typecheck`, `test`
- **npx**: direct invocation of test runners (e.g., `npx playwright test`) is blocked — use `run-package-command` tool for `test` instead
- **Curl**: only allowed to `localhost` URLs

### Build validation
- `pnpm` with flags/filters (e.g., `--filter`, `--exec`) is blocked — use `run-package-command` tool for `build`, `lint`, `typecheck`, `test`
- Package paths: `apps/web`, `apps/api`, `packages/domain`. Run validation in the package that owns the change; domain-only changes validate in `packages/domain`.
- Subagents MUST run build validation via `run-package-command` before returning
- Include results in `summary.validations` in standard response format
- When running `test` for `apps/web`, the tool returns Playwright E2E results (pass/fail counts, individual test names, error details). Test failures surface with exit code 1 and the full Playwright report in the tool output.
- Existing tests must not be modified — they represent verified acceptance criteria.
- New tests must verify real functionality (assertions on state, output, or behavior). Trivial tests that pass without validating requirements are not allowed.

### Standard Response Format
All subagents MUST return results using the [standard agent response format](.opencode/skills/delivery-pipeline/references/agent-response-format.md):
- `summary.changes` — files created or modified
- `summary.validations` — build/lint/test results
- `concerns` — any issues, blockers, or deviations
- `errors` — failures encountered

If a subagent does not follow this format, the orchestrator must re-call it specifying the required format.

### Retry Limit (failure escalation)
All subagents dispatched by the orchestrator implement a **3-attempt retry limit**. If the same action fails 3 consecutive times, the subagent must stop and report to the orchestrator which action failed, the error reason, and that it cannot proceed.

The orchestrator must then re-dispatch the subagent with appropriate error context — never attempt to resolve the failure directly.

### Test and implementation adjustment rule
- Pre-existing tests must never be touched to make an implementation pass. If a pre-existing test fails, the implementation must be adjusted until it passes.
- If a newly created test has a lint error, TypeScript error, or any other problem, both the test and the implementation must be adjusted until they pass.
- Never modify project configuration (e.g. tsconfig, eslint, vitest, package.json scripts) to make tests or implementations pass.
- Never create auxiliary files whose sole purpose is to verify or work around a test and that would be removed after verification. Verification must happen through the real tests and implementations that remain in the codebase.

### Agent Dispatch Failure (retry then abort)
If a named agent dispatch fails or stalls (e.g., a model-resolution error such as `Model not found: opencode/...`), retry the **same named dispatch** up to **3 consecutive attempts**. If all 3 attempts fail, **abort** the step and **report the error** to the user with the failure reason. Never fall back to dispatching as `general` or any other agent type to work around a failed dispatch.

## References

All project documentation is cataloged in:

```text
.opencode/INDEX.md
```