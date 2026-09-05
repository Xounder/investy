# Architecture Folder Schema

Generic skeleton describing the purpose of each folder inside the `architecture/` directory.

```
architecture/
├── architecture.md              # Entry point: system overview, principles, ADRs
├── references/                  # Reference files extracted from oversized docs
└── docs/                        # Detailed, topic-specific documentation
    ├── adrs/                    # Architecture Decision Records
    ├── backend/                 # Backend/API specification
    │   └── references/          # Support files for backend docs
    ├── feature/                 # Feature-level architecture & workflows
    │   └── references/          # Support files for feature docs
    └── frontend/                # Frontend/UI component architecture
        └── references/          # Support files for frontend docs
```

## Folder Responsibilities

### `architecture.md`

Central architecture document. Contains the system overview, architectural principles, high-level diagram, technology stack, key decisions, and links to deeper documents.

### `references/`

Stores reference material that was extracted from documents too large to keep in a single file. Content here supports the main architecture document.

### `docs/`

Container for all detailed, topic-specific documentation. Each subfolder documents one area of the system in depth.

### `docs/adrs/`

Architecture Decision Records. Numbered, timestamped records capturing significant architectural decisions, the context behind them, and the chosen outcome.

### `docs/backend/`

Documents the backend subsystem: API contracts, service boundaries, data flow, and backend-specific decisions.

### `docs/backend/references/`

Supplemental reference files for backend documentation (extended schemas, payload examples, internal notes).

### `docs/feature/`

Documents the feature layer: how features are structured, their workflows, and cross-feature orchestration.

### `docs/feature/references/`

Supplemental reference files for feature documentation.

### `docs/frontend/`

Documents the frontend subsystem: component architecture, state management, and UI-related decisions.

### `docs/frontend/references/`

Supplemental reference files for frontend documentation.