# Project Structure

```
Investy/
├── AGENTS.md                  # Entry point — rules, conventions, pipeline
├── .gitignore
│
└── .opencode/                 # AI agent configuration and documentation
    ├── INDEX.md               # Central navigation index
    ├── docs-catalog.md        # Catalog of all .md files
    ├── project-structure.md   # This file
    ├── OPENCODE_PLUGINS.md    # Plugin development guide
    ├── pipeline.yaml          # Pipeline state file
    ├── pnpm-workspace.yaml    # Workspace config
    ├── package.json           # Root package.json
    │
    ├── agents/                # Agent instruction files
    │   ├── 00-architecture-initializer.md
    │   ├── 00-planning-agent.md
    │   ├── 01-solution-designer.md
    │   ├── 02-tech-lead.md
    │   ├── 03-senior-frontend.md
    │   ├── 04-senior-backend.md
    │   ├── 05-qa-reviewer.md
    │   └── shared/
    │       ├── implementation-rules.md
    │       └── subagent-common.md
    │
    ├── architecture/          # Architecture docs
    │   ├── index.md            # Architecture entry point index
    │   ├── architecture.md     # System architecture, principles, ADR references
    │   ├── architecture-folder-schema.md
    │   ├── commit-pattern.md
    │   ├── references/         # Reference files (detailed content from oversized docs)
    │   └── docs/               # Subdirectory docs
    │       ├── adrs/           # ADR-001 through ADR-010
    │       ├── backend/        # API specification
    │       │   └── references/
    │       ├── feature/        # Feature-level architecture
    │       │   └── references/
    │       └── frontend/       # Component architecture
    │           └── references/
    │
    ├── commands/              # Custom opencode commands
    │   ├── delivery-pipeline-new.md
    │   ├── delivery-pipeline-resume.md
    │   ├── doc-audit.md
    │   └── learning-improvement.md
    │
    ├── skills/                # Skill definitions
    │   ├── delivery-pipeline/
    │   │   ├── SKILL.md
    │   │   └── references/
    │   │       ├── parallelization-rules.md
    │   │       ├── failure-recovery.md
    │   │       ├── task-tracking.md
    │   │       ├── agent-response-format.md
    │   │       ├── constraints.md
    │   │       └── execution-phases.md
    │   ├── workflow-router/
    │   │   └── SKILL.md
    │   ├── learning-improvement/
    │   │   ├── SKILL.md
    │   │   └── references/
    │   │       └── stop-chain.md
    │   ├── continuous-learning/
    │   │   └── SKILL.md
    │   ├── session-save/
    │   │   └── SKILL.md
    │   ├── doc-audit/
    │   │   └── SKILL.md
    │   └── codebase-analysis/
    │       ├── SKILL.md
    │       ├── scripts/         # scan.mjs + package.json
    │       └── output/
    │           └── docs-report.md
    │
├── template/              # Artifact templates
        │   ├── architecture-template.md
        │   ├── design-template.md
        │   ├── task-template.md
        │   ├── planning-template.md
        │   ├── pipeline-template.yaml
        │   └── variables.md
    │
    ├── plan/                  # Generated planning artifacts
    │   └── <context>/
    │       ├── design-docs/
    │       └── tasks/
    │
    ├── plugins/               # OpenCode plugins (auto-loaded)
    │   ├── code-validator.plugin.ts
    │   ├── secure-access.plugin.ts
    │   ├── session-load-autoloader.plugin.ts
    │   └── sound-alert.plugin.ts
    ├── sessions/              # Saved session evaluations
    ├── tools/                 # Custom tools
    │   ├── create-folder-structure.ts
    │   ├── get-git-diff.ts
    │   ├── read-pipeline-state.ts
    │   ├── resolve-template.ts
    │   ├── run-package-command.ts
    │   └── save-session.ts
    └── node_modules/          # Dependencies
```
