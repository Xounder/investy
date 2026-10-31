---
name: delivery-pipeline:new
description: Starts a new delivery workflow using the Delivery Pipeline skill.
---

Invoke the `delivery-pipeline` skill in new-execution mode. Before implementation, plan every known unfinished task into stable bounded principal-session batches in pipeline state; persist future batches as pending and use the durable per-batch handoff. Do not replace an active pipeline without explicit user approval; use `/delivery-pipeline:resume` to continue an existing one.
