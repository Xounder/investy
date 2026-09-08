# Architecture Folder Schema

Purpose map for every folder inside `architecture/`.

```
architecture/
├── index.md                  # Entry point index — document list, ADR summary
├── architecture.md           # System overview, principles, stack, ADRs
├── architecture-folder-schema.md  # This file — folder purpose map
├── commit-pattern.md         # Commit message convention
├── references/               # Reference files extracted from oversized docs
└── docs/                     # Detailed, topic-specific documentation
    ├── adrs/                 # Architecture Decision Records
    ├── backend/              # Backend/API specification
    │   └── references/       # Support files for backend docs
    ├── feature/              # Feature-level architecture & workflows
    │   └── references/       # Support files for feature docs
    └── frontend/             # Frontend/UI component architecture
        └── references/       # Support files for frontend docs
```

## Folder Responsibilities

### `index.md`

Architecture entry point. Lists all architecture documents, summarizes every settled decision (ADR), and maps topics to their documents.

### `architecture.md`

Central architecture document. Contains the system overview, architectural principles, high-level diagram, technology stack, domain data model, key decisions (ADR table), non-goals, success criteria, and links to deeper documents.

### `architecture-folder-schema.md`

This file. Describes the purpose of each folder in the architecture tree.

### `commit-pattern.md`

Defines the repository-wide git commit message convention. Referenced by `AGENTS.md` and mandatory reading before any commit.

### `references/`

Stores reference material extracted from documents too large to keep in a single file. Content here supports the main architecture document.

### `docs/`

Container for detailed, topic-specific documentation. Each subfolder documents one area of the system in depth.

### `docs/adrs/`

Architecture Decision Records. Numbered records capturing significant architectural decisions, the context behind them, the chosen outcome, and the alternatives considered.

### `docs/backend/`

Documents the backend subsystem: API contracts, service boundaries, worker jobs, and backend-specific decisions.

### `docs/backend/references/`

Supplemental reference files for backend documentation (extended schemas, payload examples, internal notes).

### `docs/feature/`

Documents the feature layer: how features are structured, their workflows, and cross-feature orchestration.

### `docs/feature/references/`

Supplemental reference files for feature documentation.

### `docs/frontend/`

Documents the frontend subsystem: component architecture, state management, design token usage, and UI-related decisions.

### `docs/frontend/references/`

Supplemental reference files for frontend documentation.