# Task Template

## Task Information

### ID

TASK-XX

### Title

[Task title]

### Owner

senior-frontend | senior-backend

### Status

Pending

---

## Description

[Clear description of what must be implemented]

---

## Acceptance Criteria

- [ ] Criterion
- [ ] Criterion
- [ ] Criterion

---

## Dependencies

### Required Tasks

- None

or

- TASK-XX

### Dependency Notes

[Explain dependency if applicable]

---

## Technical Context

### Relevant Components

- [Component]
- [Component]

### Relevant Modules

- [Module]
- [Module]

### Relevant APIs

- [API]
- [API]

### Relevant Types

- [Type]
- [Type]

---

## Implementation Guidance

### Expected Changes

- [Change]
- [Change]

### Constraints

- [Constraint]
- [Constraint]

### Validation Rules

- [Rule]
- [Rule]

---

## Edge Cases

- [Edge case — race conditions, empty states, API failures, optional fields, limits]
- [Edge case]

---

## Testing

### Unit Tests

- [ ] Test case
- [ ] Test case

### Integration Tests

- [ ] Test case
- [ ] Test case

### Manual Validation

- [ ] Validation step
- [ ] Validation step

---

## Definition of Done

- [ ] Implementation completed
- [ ] Acceptance criteria satisfied
- [ ] Tests created or updated
- [ ] Build passes
- [ ] Lint passes
- [ ] Validation completed
- [ ] Commits created (`feat(<feature>)[TASK-XX]` and separate `docs(<area>)` when `.opencode/` files changed)

---

## Commit

Each finalized task produces:

1. One implementation commit:
   ```text
   feat(<feature-from-pipeline.yaml>)[<TASK-XX>]: <subject>
   ```
2. One separate documentation commit when the task touched `.opencode/`:
   ```text
   docs(<area>): <detailed description>
   ```

Example subject: `add database schema and repository`. Record the commit SHAs in `pipeline.yaml` task metadata (`feat_commit`, `docs_commit`).

---

## References

- [Relevant architecture document]
- [Relevant planning document]
- [Relevant source file]