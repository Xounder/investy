---
name: delivery-pipeline:new
description: Starts a new delivery workflow using the Delivery Pipeline skill.
---

Invoke the `delivery-pipeline` skill in new-execution mode. First inspect existing pipeline state before creating folders or writing files: default to `/delivery-pipeline:resume` for an incomplete pipeline. Replace only with explicit user approval, after non-overwriting, verified in-repo preservation of its state, history and artifacts; stop on conflict or preservation failure.

Initialize from `.opencode/template/pipeline-template.yaml` with a neutral context and actual timestamps, not copied product evidence. Keep tasks/batches empty and `current_batch` null until planning; before implementation persist every known unfinished task exactly once across bounded batches, including pending future batches. Track actual task/QA/runtime evidence separately, record only existing authorized commit SHAs, and keep blockers and exact resume action current. Follow the skill's canonical [session-batch gates](../skills/delivery-pipeline/references/session-batches.md) and [STOP closeout](../skills/delivery-pipeline/references/session-batches.md#closeout-state-machine-resume-each-missing-checkpoint-only) rather than treating batch closure as product acceptance.
