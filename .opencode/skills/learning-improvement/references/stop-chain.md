# STOP Hook Chain

The STOP hook executes 3 skills in sequence, atomically:

1. **learning-improvement** — evaluates the session (DONE, WRONG, IMPROV, LEARN, NEXT)
2. **continuous-learning** — proposes and applies doc updates (with user approval)
3. **session-save** — persists the session file

After step 3, the chain is complete. Do not load any further skills.
