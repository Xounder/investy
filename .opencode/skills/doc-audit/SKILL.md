---
name: doc-audit
description: Audits all .md files in .opencode/ (excluding /plan folder) for duplicates, similar content, and prompt duplication. Analyzes docs-catalog.md to understand existing docs, then checks for file-level duplicates/similarities and intra-file prompt duplication. Requires human approval before any consolidation.
---

# Doc Audit Skill

This skill performs a comprehensive audit of all `.md` files in `.opencode/` (excluding the `/plan` folder) to identify:

1. **File-level duplicates/similarities** - Files that cover the same topic or have overlapping content
2. **Intra-file prompt duplication** - Repeated prompts or sections within the same file

## Prerequisites

- Read `.opencode/docs-catalog.md` to understand the catalog of existing documents
- Exclude `.opencode/plan/` folder entirely
- Only process `.md` files
- Ensure `codebase-analysis` skill dependencies are installed (run `pnpm install` in `.opencode/skills/codebase-analysis/scripts/`)

## Workflow

### Phase 1: Discovery & Catalog Analysis
1. List all `.md` files in `.opencode/` recursively, excluding `.opencode/plan/`
2. Read `docs-catalog.md` to understand the expected structure and purpose of each file
3. **Run `codebase-analysis` in docs mode** — execute `node scan.mjs --mode docs` from `.opencode/skills/codebase-analysis/scripts/` to obtain a structured report with heading inventory, code block languages, and file metadata for all `.opencode/` documentation
4. Use the codebase-analysis report as input to build the file map and identify potential duplicate headings before manual inspection
5. Build a map of file paths to their described purpose

### Phase 2: File-Level Duplicate/Similarity Detection
1. For each file, read its content
2. Compare files pairwise to detect:
   - **Exact duplicates** - Identical or near-identical content
   - **High similarity** - Same topic, overlapping sections, redundant information
   - **Semantic duplicates** - Different files covering the same conceptual area
3. Group similar files together with reasoning

### Phase 3: Intra-File Prompt Duplication Detection
1. For each file, scan for repeated:
   - Prompt templates
   - Instruction blocks
   - Code examples
   - Section headers with similar content
2. Identify lines/ranges that are duplicated within the same file

### Phase 4: Human Review & Approval (MANDATORY)
For each detected issue:
1. **Explain the finding**:
   - What files/sections are duplicated/similar
   - Why consolidation is recommended
   - What the consolidated result would look like
2. **Present the proposed change** with before/after view
3. **Ask for explicit human approval** before making ANY changes
4. Only proceed after clear "yes" confirmation

### Phase 5: Consolidation (After Approval)
1. Merge content into the most appropriate file (following docs-catalog.md purpose)
2. Remove the duplicate file(s) or section(s)
3. Update `docs-catalog.md` to reflect changes
4. **Enforce File Size Limit**: No file may exceed 400 lines (per AGENTS.md). If consolidation would exceed 400 lines, split into multiple files with an index.md

## Rules

- **NEVER** modify files without explicit human approval
- **ALWAYS** explain the reasoning and show the proposed result
- **RESPECT** the 400-line file size limit from AGENTS.md
- **UPDATE** `docs-catalog.md` after any structural changes
- **PRESERVE** all unique information during consolidation
- **EXCLUDE** `.opencode/plan/` folder completely from analysis

## Output Format

For each finding, present:
```
## Finding: [Type - File Duplicate / Intra-file Duplication]

**Files/Sections Involved:**
- File A: `.opencode/path/to/file.md` (lines X-Y)
- File B: `.opencode/path/to/file.md` (lines X-Y)

**Why Consolidate:**
[Explanation of overlap/redundancy]

**Proposed Result:**
[Description of consolidated file structure]

**Approve? (yes/no/modify):**
```

Wait for human response before proceeding.