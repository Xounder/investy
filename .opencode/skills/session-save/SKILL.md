---
name: session-save
description: Saves the session file in .opencode/sessions/ based on the evaluation from the learning-improvement skill. It is the last skill called in the STOP hook.
---

# Session Save Skill

## When to use

Use this skill at the end of the STOP hook, after `learning-improvement` and `continuous-learning`. It is the **third and last** of 3 skills in the STOP chain — see [learning-improvement/references/stop-chain.md](../learning-improvement/references/stop-chain.md)).

## Workflow

1. **Receive evaluation** — use the output of the `learning-improvement` skill (evaluation with DONE, WRONG, IMPROV, LEARN, NEXT)
2. **Call the `save-session` custom tool** — the tool is defined at `.opencode/tools/save-session.ts` and runs via Bun/Node (not shell):
   ```json
   {
     "evaluation": "DONE: ...\nWRONG: ...\nIMPROV: ...\nLEARN: ...\nNEXT: ...",
     "description": "brief-description"
   }
   ```
   The tool:
   - Creates file in `.opencode/sessions/` with format: `YYYYMMDD-HH-MM-description-session.tmp`
   - Keeps only the 2 most recent session files (newly created + previous one)
   - Deletes older session files automatically
3. **Content** — same as the received evaluation, 5-7 lines in English, each section starting with an uppercase label followed by `:`

## Expected output

- File `.opencode/sessions/YYYYMMDD-HH-MM-description-session.tmp` created
- Only 2 session files retained in the directory
- For delivery batches, the detailed handoff remains under `plan/<context>/references/` and is not deleted by this tool; record the saved session path in the batch closeout checkpoint.

## Rules

- Do not modify the received evaluation
- Do not propose changes to docs (this is the responsibility of `continuous-learning`)
- Only save the file and report to the user
- Use the `save-session` custom tool for consistent behavior

## Chain position

This is the **LAST** (3rd) skill in the STOP chain — see [learning-improvement/references/stop-chain.md](../learning-improvement/references/stop-chain.md). After saving, the chain is complete; load no further skills in this STOP chain. For delivery batches, the orchestrator still must finalize the handoff/state, authorized remaining docs commit and read-back verification before reporting ready for a new session; this is not a second STOP chain.

## Tool Reference

**Tool location**: `.opencode/tools/save-session.ts` (custom tool, runs via Bun/Node)

**Usage** (called automatically by opencode):
```json
{
  "evaluation": "DONE: ...\nWRONG: ...\nIMPROV: ...\nLEARN: ...\nNEXT: ...",
  "description": "doc-audit"
}
```
