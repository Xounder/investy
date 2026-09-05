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
