---
name: learning-improvement
description: Analyzes the session that just occurred and extracts learnings: what was done, what went right, what went wrong, what can be improved. Generates the evaluation for the following skills (continuous-learning and session-save).
---

# Learning Improvement Skill

## When to use

Use this skill at the end of a complete implementation (e.g.: Frontend → QA → STOP). It is the **first** of 3 skills in the STOP chain — see [learning-improvement/references/stop-chain.md](../learning-improvement/references/stop-chain.md).

## Workflow

 1. Review the current session history (tool calls, errors, results)
 2. Extract the following topics:
    - **DONE**: What was accomplished in the session
    - **WRONG: Technical failures** — bugs, build errors, rework, bad technical decisions
    - **WRONG: Process failures** — orchestrator violations, subagent deviations, format violations, missed recordings
    - **IMPROV: Technical improvements** — what to change in code/architecture next time
    - **IMPROV: Process improvements** — what to change in orchestration/dispatch next time
    - **IMPROV: Doc gaps** — missing or unclear rules in agent docs, skills, or conventions
    - **LEARN: Technical discoveries** — framework quirks, API behaviors, type system lessons
    - **LEARN: Process discoveries** — shell restrictions, tool limitations, pipeline behavior
    - **NEXT: Actionable follow-ups** — concrete next steps (run tests, manual validation, deploy, refinements)

 3. **Output the evaluation** — produce all extracted topics in text (English, up to 12 lines covering both technical and process dimensions). NEXT must contain actionable follow-ups — do NOT include chain steps (continuous-learning, session-save) as those are the skill's own automatic responsibility.
4. **Chain to next skills IMMEDIATELY** — after outputting the evaluation, you MUST call the `continuous-learning` skill (load via skill tool) and pass the evaluation as context. After `continuous-learning` completes, you MUST call `session-save`.
5. **Never stop after step 3** — producing the evaluation without chaining is a failure. The three skills are a single atomic sequence.

## Expected output

- Text evaluation with all extracted topics (up to 12 lines, English, covering both technical and process dimensions)
- NEXT contains actionable follow-ups only (not chain steps)
- Pass this evaluation to the `continuous-learning` skill as input

## Enforcement

- This skill is invoked by the STOP hook in pipeline agents. The hook expects all 3 skills to run.
- If only the evaluation is produced and the chain stops, the session is considered incomplete.
- Whether loaded via `skill` tool or triggered by a direct command, the full chain MUST execute.
