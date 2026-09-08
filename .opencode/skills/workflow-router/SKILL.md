---
name: workflow-router
description: Classifies incoming requests and selects the appropriate workflow entry point (Solution Designer, Planning Analyst, or Tech Lead) based on codebase presence, requirement clarity, complexity, scope, and planning needs.
---

# Workflow Router Skill

## Purpose

Determine which workflow path should be executed.

The router never creates files and never modifies source code.

Its only responsibility is selecting the correct entry point.

## Architecture Base Prerequisite

Routing requires a complete **architecture documentation set**:

- `[ARCHITECTURE_ENTRY_FILE]` — `.opencode/architecture/architecture.md`
- `[ARCHITECTURE_INDEX_FILE]` — `.opencode/architecture/index.md`
- `[DOCS_CATALOG_FILE]` — `.opencode/docs-catalog.md`
- `[PROJECT_STRUCTURE_FILE]` — `.opencode/project-structure.md`
- INDEX.md `# Architecture` section

If any piece is missing (or a codebase exists without these docs), the pipeline dispatches the Architecture Initializer to bootstrap or backfill the set.

- New execution and resume/recovery handling for the set check, dispatch, approval, verification, and update live in the **delivery-pipeline** skill — see [Architecture Initialization Flow](../delivery-pipeline/references/execution-phases.md#architecture-initialization-flow). That skill is the single source of truth for the flow.
- The router itself does **not** route to the Architecture Initializer — dispatch happens before routing.

## Decision Tree

```mermaid
flowchart LR

A[User Request] --> AI{Architecture Docs Complete?}

AI -->|No| ABI[Architecture Initializer]

ABI --> AB_APPROVAL{Base Approved?}

AB_APPROVAL -->|No| ABI
AB_APPROVAL -->|Yes| B{Codebase Exists?}

AI -->|Yes| B{Codebase Exists?}

B -->|No| SD[Solution Designer]

B -->|Yes| C{Request Type}

C -->|Idea / Undefined Requirements| SD

C -->|Implementation Analysis| PA[Planning Analyst]

C -->|Small Well Defined Change| TL[Tech Lead]
```

## Routing Rules

### Route to Solution Designer

Use when:

- No codebase exists
- Requirements are unclear
- User provides only a high-level idea
- Design exploration is needed
- Multiple approaches need evaluation

When a codebase exists, the pipeline automatically chains Planning Analyst after Solution Designer
to validate design decisions against the actual code.

Examples:

- "I want to build a school system"
- "I have an idea for an app"
- "Help me design the approach for X"
- "What are the options for implementing Y?"

### Route to Planning Analyst

Use when:

- Codebase already exists
- User requests analysis
- User requests feasibility evaluation
- User requests architectural guidance
- User requests medium or large changes
- Implementation approach is known and only feasibility/impact analysis is needed

Examples:

- "Add multi-tenancy"
- "Migrate authentication to OAuth"
- "What could break if we change X?"

### Route to Tech Lead

Use when:

- Requirements are already defined
- Scope is small
- Implementation approach is obvious
- Planning is unnecessary

Examples:

- "Add a column to the user table"
- "Create an endpoint for X"
- "Add validation to Y"

## Complexity Classification

### Small

Characteristics:

- Single layer affected
- Low risk
- Obvious implementation
- No architectural impact

Route:

```text
Tech Lead
```

### Medium

Characteristics:

- Multiple files
- Multiple possible approaches
- Architectural decisions required

Route:

```text
Planning Analyst
```

### Large

Characteristics:

- Cross-cutting changes
- Significant architectural impact
- High implementation risk

Route:

```text
Planning Analyst
```

## Output

Return:

```yaml
route: solution-designer | planning-analyst | tech-lead

reason: "<why the route was selected>"

complexity: small | medium | large
```

## Constraints

- Never create files
- Never modify source code
- Never execute implementation tasks
- Never generate design documents
- Never generate planning documents
- Never generate technical tasks
- Only classify and route requests
- Never route a request before the architecture documentation set is complete — if `[ARCHITECTURE_ENTRY_FILE]`, `[DOCS_CATALOG_FILE]`, or `[PROJECT_STRUCTURE_FILE]` is missing (or the INDEX.md `# Architecture` section is empty), return the Architecture Base prerequisite state so the pipeline dispatches the Architecture Initializer
- Prefer Tech Lead when planning is unnecessary
- Prefer Planning Analyst when the implementation goal is clear and only feasibility/impact analysis is needed
- Prefer Solution Designer when requirements are incomplete, design exploration is needed, or no codebase exists