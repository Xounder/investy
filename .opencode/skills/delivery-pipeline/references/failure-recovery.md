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

Completed work must never be repeated. Follow [session-batches.md](session-batches.md#resume-and-legacy-recovery) to check the current batch handoff, Git state, session identity and closeout checkpoints before dispatch. Do not advance to a later batch within the same principal session.

### Abandoned Pipeline Detection

If a pipeline step remains `running` for more than 24 hours without state updates, it should be treated as potentially abandoned. Before resuming:

1. Verify the step's agent actually produced output (check for target files, git diff, build artifacts).
2. Compare the actual output/diff, relevant last-edit validation evidence, QA result and recorded SHAs to the handoff. **File existence or build artifacts alone are not proof of validation, QA, or completion.** Keep partial/running or blocked until evidence is recovered or checks rerun.
3. If evidence is missing, record the uncertainty, partial output and retry count; re-dispatch the same named agent only when dependency and budget gates allow. A reconciled `running` current batch can resume in the same principal session; a later pending batch requires a fresh confirmed session after closeout. Never overwrite uncommitted user work.
4. If re-dispatch fails repeatedly (3 attempts), stop, record the failure and escalate rather than declaring the output completed.

This prevents stale `running` states from blocking pipeline recovery.
