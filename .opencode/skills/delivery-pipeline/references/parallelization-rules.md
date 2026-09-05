# Parallelization Rules

## Allowed

Frontend and Backend tasks may execute simultaneously when:

* Dependencies are satisfied
* Contracts are already defined
* No blocking dependency exists

Example:

```text
Backend creates API

Frontend consumes API contract

Both may proceed if the contract is already defined.
```

## Not Allowed

Tasks with unmet dependencies must wait.

Example:

```text
TASK-02 depends on TASK-01

TASK-02 must not start until TASK-01 completes.
```
