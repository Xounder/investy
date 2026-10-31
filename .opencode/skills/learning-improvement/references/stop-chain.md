# STOP Hook Chain

For delivery-pipeline work, execute this chain once **per bounded session batch**, including the final batch, only after the preliminary durable handoff is saved. The chain has resumable checkpoints; "atomically" does not mean bypassing user approval or pretending an interrupted skill ran.

The chain is mandatory for each applicable batch or planning-session closeout, including budget-stopped or blocked started work. Protect the closeout reserve before accepting more work so all three skills can run; a `continue` budget policy does not authorize spending that reserve. If interrupted or waiting for approval, record the missing checkpoints and resume them before declaring closeout complete. A pre-execution blocker record is not a fabricated completed batch.

1. **learning-improvement** — evaluates the session (DONE, WRONG, IMPROV, LEARN, NEXT)
2. **continuous-learning** — proposes and applies doc updates (with user approval)
3. **session-save** — persists the session file

Continuous-learning's explicit approval gate is mandatory: on pending approval persist `closing` and resume at the question; on decline record the decision and continue to session-save without applying changes. After step 3 the chain is complete. Do not recursively load these skills again during the same batch's final state/commit/read-back work; load no further STOP skills. Follow [batch closeout](../../delivery-pipeline/references/session-batches.md#closeout-state-machine-resume-each-missing-checkpoint-only).
