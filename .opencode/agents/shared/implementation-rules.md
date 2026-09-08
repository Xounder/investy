# Implementation Rules

Shared implementation rules for Senior Frontend and Senior Backend agents. Referenced from the agent files to avoid prompt duplication.

## Architecture

- Implement only what is assigned; never expand scope beyond the task file.
- Follow the architecture documentation in `.opencode/architecture/` (ADR-001 to ADR-010).
- Respect the dependency direction: `web` and the API worker depend on `domain`; `domain` depends on nothing internal.
- Finalize change first, then validate in the package that owns the change.
- Do not question settled decisions recorded as ADRs — implement them.
- Never modify application configuration (tsconfig, eslint, vitest, package.json scripts) to make tests pass.

## Money and Data Rules

- Money is integer cents (`BIGINT`) — never floats (ADR-004).
- The transaction journal is the source of truth; every position derives from journal entries (ADR-005).
- Every record is scoped to its owner; the API enforces ownership on every query; cross-user access is forbidden (ADR-006).
- No secrets in the browser (ADR-008); secrets exist only on the server.

## Code Quality

- Follow existing code conventions in the area being changed.
- Prefer strict typing; use type-only imports when appropriate.
- Avoid unused and dead code.
- Prefer the dedicated tools (grep, glob, read, edit, write) over shell for file operations.
- Keep files under 400 lines; split larger content into `references/`.
- Document in English only (AGENTS.md rule).
- Do not add code comments unless required.

## Testing and Validation

- Run build/lint/typecheck/test via `run-package-command` in the package that owns the change.
- Include validation results in `summary.validations`.
- Never modify pre-existing tests — they represent verified acceptance criteria.
- New tests must verify real functionality (assertions on state, output, or behavior); trivial tests are not allowed.
- Never create auxiliary files whose sole purpose is to verify or work around a test and would be removed afterward.