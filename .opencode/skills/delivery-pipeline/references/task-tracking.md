# Task Tracking

Implementation tasks must be tracked in pipeline state.

Example:

```yaml
tasks:

  - id: TASK-01
    title: Create User Endpoint
    owner: senior-backend
    status: completed
    notes: null
    updated_at: 2026-06-11T20:00:00Z

  - id: TASK-02
    title: Create User Screen
    owner: senior-frontend
    status: pending
    notes: Depends on TASK-01
    updated_at: null
```
