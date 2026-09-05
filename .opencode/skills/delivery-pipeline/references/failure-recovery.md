# Failure Recovery

After every agent execution:

1. Save pipeline state.
2. Save summary.
3. Save errors.
4. Save concerns.
5. Save history entry.

Examples of what to record:
- **errors**: build failures, runtime crashes, test failures, compilation errors
- **concerns**: shell restrictions, ambiguous specifications, tool limitations, environment issues

### Resume Metadata Accuracy

After updating pipeline state, verify that `resume.last_completed_agent` and `resume.last_completed_step` match the actual completed work. These fields must be updated when a step finishes — never leave them pointing to a pending step.

### Git Diff Tool Limitations

The `get-git-diff` tool may fail with `undefined..undefined` because its default arguments are not applied at runtime. Use `bash` with explicit refs as a fallback:

```text
git diff HEAD~1 -- apps/web/
```

Specify both `baseRef` and `headRef` explicitly when calling the tool.

---

If execution stops unexpectedly:

```text
delivery-pipeline:resume
```

must continue from the latest persisted state.

Completed work must never be repeated.

### Abandoned Pipeline Detection

If a pipeline step remains `running` for more than 24 hours without state updates, it should be treated as potentially abandoned. Before resuming:

1. Verify the step's agent actually produced output (check for target files, git diff, build artifacts).
2. If output exists but the step was not marked complete, update the step to `completed` and continue.
3. If no output exists, re-dispatch the agent with the original task context.
4. If re-dispatch fails repeatedly (3 attempts), mark the step as `failed` and update pipeline status to `failed`.

This prevents stale `running` states from blocking pipeline recovery.
