# Drizzle migrations (apps/api)

Drizzle Kit generates versioned SQL migrations into this directory via:

```text
pnpm db:generate
```

and applies them with:

```text
pnpm db:migrate
```

The directory is empty in the M0 foundation milestone: the schema
(`src/db/schema.ts`) intentionally holds no tables yet. The first migrations
arrive with the M1 schema/backend tasks (ADR-004).