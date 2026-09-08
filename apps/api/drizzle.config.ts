import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle config for apps/api (ADR-004).
 * Migration output lands in ./drizzle. The connection URL comes from the
 * DATABASE_URL environment variable; a local default keeps tooling usable
 * before any real Postgres instance is provisioned.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/investy',
  },
});