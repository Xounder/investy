import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { closeDb, getDb } from './client.js';

/**
 * Applies pending Drizzle migrations from ./drizzle.
 * Run via `pnpm db:migrate` from apps/api.
 */
async function main(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Database migrations applied.');
  await closeDb();
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});