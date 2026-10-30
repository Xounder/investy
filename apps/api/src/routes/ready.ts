import { sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { getDb } from '../db/client.js';

let bootStarted = false;
let bootSucceeded = false;

/** Server bootstrap must complete before the Docker readiness probe succeeds. */
export function beginBoot(): void {
  bootStarted = true;
  bootSucceeded = false;
}

export function completeBoot(): void {
  bootSucceeded = true;
}

/** Read-only connection probe; never include driver errors or URLs in responses. */
export async function readiness(c: Context) {
  try {
    if (bootStarted && !bootSucceeded) return c.json({ status: 'unavailable' }, 503);
    await getDb().execute(sql`SELECT 1`);
    return c.json({ status: 'ready' });
  } catch {
    return c.json({ status: 'unavailable' }, 503);
  }
}
