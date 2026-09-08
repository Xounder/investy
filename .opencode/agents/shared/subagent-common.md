# Subagent Common Rules

Shared rules for all subagents. Referenced from the agent files to avoid prompt duplication.

## Return Format

Return using the [standard agent response format](../skills/delivery-pipeline/references/agent-response-format.md). MUST include `summary.changes`, `summary.validations`, `concerns`, and `errors`.

The orchestrator reads this response to update pipeline.yaml — structured format is required for correct parsing.

FAILURE TO RETURN STANDARD FORMAT WILL CAUSE ORCHESTRATOR TO RE-DISPATCH — this is mandatory.

## Retry Limit (failure escalation)

If the same action fails 3 consecutive times, the subagent MUST NOT retry. Instead, it must return to the orchestrator/agent that created it, reporting:

1. Which action failed
2. The error reason observed
3. That it cannot proceed further