---
name: delivery-pipeline:resume
description: Resumes the current delivery workflow from the persisted pipeline state.
---

Invoke the `delivery-pipeline` skill in resume mode. Resolve variables; read `.opencode/pipeline.yaml`, the current batch's durable handoff and Git branch/HEAD/dirty/staged state. Reconcile existing commits and latest relevant validation/QA; outputs alone never prove completion. If the previous principal session is still active, finish only missing closeout checkpoints; if identity cannot be determined, ask the user to confirm a fresh session before moving to another batch. Do not replay commits or dispatch future batches in the same session. Respect the context-budget unknown-stop-new-work fallback and blocked Docker/runtime acceptance.
