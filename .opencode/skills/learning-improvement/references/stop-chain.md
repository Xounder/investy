# STOP Hook Chain

For delivery-pipeline work, execute this chain once **per bounded session batch**, including the final batch, only after the preliminary durable handoff is saved. The chain has resumable checkpoints; "atomically" does not mean bypassing user approval or pretending an interrupted skill ran.

1. **learning-improvement** — evaluates the session (DONE, WRONG, IMPROV, LEARN, NEXT)
2. **continuous-learning** — proposes and applies doc updates (with user approval)
3. **session-save** — persists the session file

Continuous-learning's explicit approval gate is mandatory: on pending approval persist `closing` and resume at the question; on decline record the decision and continue to session-save without applying changes. After step 3 the chain is complete. Do not recursively load these skills again during the same batch's final state/commit/read-back work; load no further STOP skills. Follow [batch closeout](../../delivery-pipeline/references/session-batches.md#closeout-state-machine-resume-each-missing-checkpoint-only).
