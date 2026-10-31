# Task Tracking

Implementation tasks must be tracked in pipeline state.

Task IDs remain unique across `pipeline.tasks` and appear exactly once across `pipeline.batches` while unfinished. `status: in-progress` with `qa_status: approved` and deferred/blocked `validation_status` remains unfinished, even if a code-QA implementation SHA exists. Batch `completed` is a session handoff outcome only; task `completed` requires full acceptance. Preserve historical SHAs/status and archived history during migration. See [session-batches.md](session-batches.md).

Each finalized task records the commits created at QA approval time:

- `feat_commit` — SHA of the `feat(<feature>)[TASK-XX]` implementation commit
- `docs_commit` — SHA of the separate `docs(<area>)` commit; null when the task did not touch `.opencode/` files

Example:

```yaml
tasks:

  - id: TASK-01
    title: Create User Endpoint
    owner: senior-backend
    status: completed
    feat_commit: a1b2c3d4
    docs_commit: null
    notes: null
    updated_at: 2026-06-11T20:00:00Z

  - id: TASK-02
    title: Create User Screen
    owner: senior-frontend
    status: completed
    feat_commit: e5f6a7b8
    docs_commit: c9d0e1f2
    notes: Updated .opencode/design-system docs
    updated_at: 2026-06-12T10:30:00Z

  - id: TASK-03
    title: Add Database Schema
    owner: senior-backend
    status: pending
    notes: Depends on TASK-01
    updated_at: null
```
