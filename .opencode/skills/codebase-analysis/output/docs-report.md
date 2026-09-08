# Codebase Analysis — Documentation

Generated: 2026-09-08T00:21:44.803Z

```

╔══════════════════════════════════════════╗
║     Codebase — Documentation Report      ║
╚══════════════════════════════════════════╝

Generated: 2026-09-08T00:21:44.803Z

── Overview ──
  Total files:       63
  Markdown (.md):    53
  JSON:              6
  YAML:              4
  Text (.txt):       0
  Total headings:    516
  Total code blocks: 60
  Total list items:  1313

── Code Block Languages ──
  text                 36
  ts                   9
  (none)               7
  yaml                 4
  mermaid              2
  json                 2

── Duplicate Headings (56) ──
  "role" — 7x
  "inputs" — 7x
  "responsibilities" — 8x
  "workflow" — 13x
  "9. update pipeline" — 2x
  "return format" — 4x
  "retry limit (failure escalation)" — 6x
  "constraints" — 11x
  "output" — 3x
  "1. review assigned tasks" — 3x
  "2. review relevant code" — 2x
  "3. implement solution" — 2x
  "4. review changes" — 2x
  "5. validate implementation" — 2x
  "8. return results" — 3x
  ... and 41 more

── All Headings (341) ──
  architecture initializer agent                .opencode/agents/00-architecture-initializer.md
  role                                          .opencode/agents/00-architecture-initializer.md
  architecture documentation set                .opencode/agents/00-architecture-initializer.md
  when to run                                   .opencode/agents/00-architecture-initializer.md
  inputs                                        .opencode/agents/00-architecture-initializer.md
  responsibilities                              .opencode/agents/00-architecture-initializer.md
  workflow                                      .opencode/agents/00-architecture-initializer.md
  1. verify architecture presence               .opencode/agents/00-architecture-initializer.md
  2. understand the request                     .opencode/agents/00-architecture-initializer.md
  3. map existing context                       .opencode/agents/00-architecture-initializer.md
  4. research approaches                        .opencode/agents/00-architecture-initializer.md
  5. present options                            .opencode/agents/00-architecture-initializer.md
  6. collaborative loop                         .opencode/agents/00-architecture-initializer.md
  7. create the architecture base               .opencode/agents/00-architecture-initializer.md
  8. verify files                               .opencode/agents/00-architecture-initializer.md
  9. update pipeline                            .opencode/agents/00-architecture-initializer.md
  architecture file rules                       .opencode/agents/00-architecture-initializer.md
  return format                                 .opencode/agents/00-architecture-initializer.md
  retry limit (failure escalation)              .opencode/agents/00-architecture-initializer.md
  constraints                                   .opencode/agents/00-architecture-initializer.md
  planning analyst agent                        .opencode/agents/00-planning-agent.md
  1. analyze request                            .opencode/agents/00-planning-agent.md
  2. review design documents (if chained after solution designer) .opencode/agents/00-planning-agent.md
  3. explore the codebase                       .opencode/agents/00-planning-agent.md
  4. analyze feasibility                        .opencode/agents/00-planning-agent.md
  5. analyze impact                             .opencode/agents/00-planning-agent.md
  6. analyze risks                              .opencode/agents/00-planning-agent.md
  7. compare approaches (independent flow only) .opencode/agents/00-planning-agent.md
  8. approval loop                              .opencode/agents/00-planning-agent.md
  9. create planning documents                  .opencode/agents/00-planning-agent.md
  ... and 311 more

── Files Scanned ──
  .opencode/INDEX.md  [13 headings, 0 code blocks]
  .opencode/OPENCODE_PLUGINS.md  [21 headings, 10 code blocks]
  .opencode/agents/00-architecture-initializer.md  [20 headings, 5 code blocks]
  .opencode/agents/00-planning-agent.md  [18 headings, 0 code blocks]
  .opencode/agents/01-solution-designer.md  [18 headings, 4 code blocks]
  .opencode/agents/02-tech-lead.md  [21 headings, 0 code blocks]
  .opencode/agents/03-senior-frontend.md  [20 headings, 0 code blocks]
  .opencode/agents/04-senior-backend.md  [21 headings, 0 code blocks]
  .opencode/agents/05-qa-reviewer.md  [19 headings, 0 code blocks]
  .opencode/agents/shared/implementation-rules.md  [5 headings, 0 code blocks]
  .opencode/agents/shared/subagent-common.md  [3 headings, 0 code blocks]
  .opencode/architecture/architecture-folder-schema.md  [15 headings, 1 code blocks]
  .opencode/architecture/architecture.md  [18 headings, 1 code blocks]
  .opencode/architecture/commit-pattern.md  [10 headings, 7 code blocks]
  .opencode/architecture/docs/adrs/ADR-001-full-stack-architecture.md  [7 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-002-monorepo-structure.md  [7 headings, 1 code blocks]
  .opencode/architecture/docs/adrs/ADR-003-market-data-proxy.md  [7 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-004-postgres-storage.md  [7 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-005-transaction-journal.md  [7 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-006-auth-multiuser.md  [7 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-007-scheduled-worker.md  [7 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-008-hosting-deployment.md  [7 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-009-design-system-frontend.md  [7 headings, 0 code blocks]
  .opencode/architecture/docs/adrs/ADR-010-security.md  [7 headings, 0 code blocks]
  .opencode/architecture/index.md  [5 headings, 0 code blocks]
  .opencode/commands/delivery-pipeline-new.md  [0 headings, 0 code blocks]
  .opencode/commands/delivery-pipeline-resume.md  [0 headings, 0 code blocks]
  .opencode/commands/doc-audit.md  [0 headings, 0 code blocks]
  .opencode/commands/learning-improvement.md  [0 headings, 0 code blocks]
  .opencode/docs-catalog.md  [8 headings, 0 code blocks]
  .opencode/package-lock.json  [keys: name, lockfileVersion, requires, packages]
  .opencode/package.json  [keys: scripts, dependencies, devDependencies]
  .opencode/pipeline.yaml  [keys: pipeline]
  .opencode/pnpm-lock.yaml  [keys: lockfileVersion, settings, importers, packages, snapshots]
  .opencode/pnpm-workspace.yaml  [keys: allowBuilds]
  .opencode/project-structure.md  [1 headings, 1 code blocks]
  .opencode/skills/codebase-analysis/SKILL.md  [13 headings, 0 code blocks]
  .opencode/skills/codebase-analysis/output/combined-report.json  [keys: generatedAt, mode, implementation, documentation]
  .opencode/skills/codebase-analysis/output/combined-report.md  [2 headings, 1 code blocks]
  .opencode/skills/codebase-analysis/output/docs-report.json  [keys: generatedAt, mode, summary, files, errors, headingIndex, codeBlockLanguages]
  .opencode/skills/codebase-analysis/output/docs-report.md  [1 headings, 1 code blocks]
  .opencode/skills/codebase-analysis/output/implementation-report.json  [keys: generatedAt, mode, parser, summary, files, errors, dependencyCount, perPackage]
  .opencode/skills/codebase-analysis/output/implementation-report.md  [1 headings, 1 code blocks]
  .opencode/skills/codebase-analysis/scripts/package.json  [keys: name, type, private, dependencies]
  .opencode/skills/continuous-learning/SKILL.md  [4 headings, 0 code blocks]
  .opencode/skills/delivery-pipeline/SKILL.md  [22 headings, 6 code blocks]
  .opencode/skills/delivery-pipeline/references/agent-response-format.md  [2 headings, 2 code blocks]
  .opencode/skills/delivery-pipeline/references/constraints.md  [1 headings, 0 code blocks]
  .opencode/skills/delivery-pipeline/references/execution-phases.md  [13 headings, 4 code blocks]
  .opencode/skills/delivery-pipeline/references/failure-recovery.md  [4 headings, 2 code blocks]
  .opencode/skills/delivery-pipeline/references/parallelization-rules.md  [3 headings, 2 code blocks]
  .opencode/skills/delivery-pipeline/references/task-tracking.md  [1 headings, 1 code blocks]
  .opencode/skills/doc-audit/SKILL.md  [11 headings, 0 code blocks]
  .opencode/skills/learning-improvement/SKILL.md  [5 headings, 0 code blocks]
  .opencode/skills/learning-improvement/references/stop-chain.md  [1 headings, 0 code blocks]
  .opencode/skills/session-save/SKILL.md  [7 headings, 2 code blocks]
  .opencode/skills/workflow-router/SKILL.md  [14 headings, 5 code blocks]
  .opencode/template/architecture-template.md  [12 headings, 1 code blocks]
  .opencode/template/design-template.md  [29 headings, 0 code blocks]
  .opencode/template/pipeline-template.yaml  [keys: pipeline]
  .opencode/template/planning-template.md  [36 headings, 0 code blocks]
  .opencode/template/task-template.md  [28 headings, 2 code blocks]
  .opencode/template/variables.md  [0 headings, 0 code blocks]

```
