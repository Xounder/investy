---
name: continuous-learning
description: Receives the evaluation from the learning-improvement skill, analyzes which .opencode/ docs can be improved based on learnings, creates a change plan and presents it to the user for approval before applying.
---

# Continuous Learning Skill

## When to use

Use this skill after `learning-improvement` in the STOP hook. It is the **second** of 3 skills in the STOP chain — see [learning-improvement/references/stop-chain.md](../learning-improvement/references/stop-chain.md).

## Workflow

 1. **Receive evaluation** — read the output of the `learning-improvement` skill as a **summary and complement**, NOT as the single source of truth. The evaluation highlights key points but may omit process/orchestration issues. You MUST independently verify the session history.
 2. **Analyze existing docs** — consult `.opencode/docs-catalog.md` to map which file to modify, then review the relevant files:
    - `project-structure.md` — keep updated if important folders/files changed
    - `docs-catalog.md` — keep updated if new `.md` files were created in `.opencode/` **(excluding `.opencode/plan/`)**; **remove completely** the entries for files that no longer exist in the project tree (do not leave strikethrough markdown)
    - `AGENTS.md` — commands, scripts, conventions
    - `INDEX.md` — central guide, references
    - `skills/**/SKILL.md` — skills that need adjustment
    - `commands/*.md` — chat commands
    - `architecture/*.md` — architecture docs

    **Independent analysis** — regardless of the evaluation content, verify the session for issues it may have omitted:
    - Review `.opencode/pipeline.yaml` — check `errors` and `concerns` arrays under each step for recorded problems and improvement opportunities
    - Check if subagents followed the [standard response format](../delivery-pipeline/references/agent-response-format.md) — if not, agent docs may need stronger enforcement
    - Check if shell restrictions blocked commands — agent docs may need allowed-command documentation
    - Check if the orchestrator violated constraints (fixed code, ran build directly) — SKILL.md may need stronger rules
    - Check if new `.md` files were created in `.opencode/` (excluding `plan/`) — `docs-catalog.md` and `INDEX.md` need updating
 3. **Create change plan** — list files and proposed changes, with justification based on session learnings. **Do NOT edit any files during this step** — planning only.
    - **If the evaluation contains WRONG or IMPROV items, you MUST propose at least one doc improvement to prevent recurrence.** Never conclude "no changes needed" when failures exist. Examples: missing convention in AGENTS.md, unclear rule in a SKILL.md, incomplete checklist in an agent doc.
4. **Present plan to the user** — display clearly in chat using the template format. **Do NOT edit any files during this step** — presentation only:
   ```
   ## Doc update plan
   
   Based on the session evaluation, I propose:
   
   `Where`:  `path/file.md`
   `Why`: Session context explaining why this change is needed
   `Best`: Why this file is the correct location (docs-catalog mapping)
   `Modification`: 
   	~ Modified line description #(line X -> switch)
   	- Removed line description #(line Y -> remove)
   	+ Added line description #(line Z -> add)
   
   Would you like to apply these changes?
   ```
5. **Wait for user response**:
   - If **yes**: apply all changes
   - If **adjustments**: user informs what to adjust
     - **RE-PLAN PHASE**: Create NEW plan (do NOT edit files), present updated `<changes>` template, wait for "yes"
     - **NEVER edit files between receiving 'adjustments' and receiving 'yes' on updated plan**
6. **Chain to `session-save` IMMEDIATELY** — after applying changes (or determining no changes are needed), you MUST load the `session-save` skill without waiting for user input. Never stop after step 5.

## Rules

- Never modify application source code (only docs in `.opencode/`)
- **ONLY modify .md files in .opencode/ — ignore .opencode/node_modules, .opencode/plan, .opencode/.gitignore, .opencode/package-lock.json, .opencode/package.json, .opencode/pipeline.yaml**
- **ALWAYS consult .opencode/docs-catalog.md to identify which file to modify before making any changes**
- **Evaluate modification type** — for each proposed change, determine whether the best approach is: (a) edit an existing doc in place, (b) add/remove sections from an existing doc, or (c) create a new doc or skill. When creating new files, ensure correct cross-references in `INDEX.md`, `docs-catalog.md`, and the new file itself. Consult `docs-catalog.md` first to verify no existing file already covers the need.
- **ALWAYS present detailed change proposal to user and wait for explicit confirmation before modifying any file**
- **Change proposal MUST use the <changes> template format**
- Always justify each proposed change based on the session evaluation
- If no changes are needed **and the evaluation has no WRONG or IMPROV items**, inform the user and proceed. If WRONG or IMPROV items exist, you MUST propose a change — do not skip.
- After applying changes, **do not save session** — this is the responsibility of the `session-save` skill
- **AFTER analyzing existing docs, CHECK if session learnings indicate need for NEW skill/agent/document creation**
- **ALWAYS consult .opencode/docs-catalog.md FIRST to verify no existing file covers the need and identify correct location for new file**
- **If new file needed, include in change proposal with file path, why (session context), why correct location (docs-catalog mapping), and template content**
