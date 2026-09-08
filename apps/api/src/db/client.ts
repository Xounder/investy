import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

let pool: Pool | null = null;
let db: NodePgDatabase | null = null;

/**
 * Returns a lazily-initialized Drizzle client backed by DATABASE_URL.
 *
 * The connection is created on first use, so the API boots cleanly when
 * DATABASE_URL is missing: only database-backed operations fail, with a
 * clear error message (edge case from TASK-01).
 */
export function getDb(): NodePgDatabase {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Provide a Postgres connection string before using the database layer.',
    );
  }

  if (!db) {
    pool = new Pool({ connectionString });
    db = drizzle({ client: pool });
  }

  return db;
}

/** Closes the underlying connection pool, if one was created. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}