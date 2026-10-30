# Standard Agent Response Format

All agents MUST return:

```yaml
summary:
  changes:
    - item            # File paths created or modified
  validations:
    - item            # Build, lint, typecheck results
concerns:
  - item              # Blockers, deviations, tool limitations
errors:
  - item              # Failures encountered (may be empty)
```

Fields:
- `summary.changes` — list every file created or modified with a brief description
- `summary.validations` — report whether build/lint/typecheck passed or failed
- `concerns` — record any issues: shell restrictions, ambiguous specs, tool limitations
- `errors` — record failures: build errors, runtime errors, unexpected behavior

Errors may be empty.
Concerns may be empty.

## Final-State Validation Gate

- Identify the package, command, result, counts, and whether each required check covers the latest relevant code, test, or configuration edit.
- After an edit that affects a check, rerun that check. If it was not rerun, label the earlier result explicitly; do not present it as final green validation. Unrelated package checks do not need repetition for documentation-only changes.
- Distinguish passed, failed, blocked, skipped, and not-run checks. Report fixture-backed and real-database test counts separately; skipped cases never count as passes.
- If available code checks pass but external runtime checks are blocked, state the narrower code/config/scaffold QA scope and list the unresolved runtime acceptance criteria.
- If the final relevant state lacks a required available check, return a partial result with actionable remaining work, not a completion or QA-ready claim.
- Reserve execution budget for final checks. When the remaining budget is insufficient, stop editing and report the validation gap instead of adding another unchecked patch.
- Describe observed failures accurately. A timeout, worker exit, or missing UI element does not establish an environmental root cause without supporting evidence.

## Example

```yaml
summary:
  changes:
    - Created apps/web/src/components/Button.tsx
    - Modified apps/web/src/main.tsx (added provider)
  validations:
    - tsc passed with zero errors
    - vite build succeeded (142 modules)
concerns:
  - Shell restricted `pnpm exec tsc` — used `pnpm build` instead
  - Could not verify lint (no lint script configured)
errors: []
```
