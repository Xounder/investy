import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { erasureTombstones, users } from '../db/schema.js';
import { verifyPassword } from '../lib/password.js';
import { eraseBackupFiles } from './backup-storage.js';

/** All owned tables and sessions have ON DELETE CASCADE from users (directly or
 * via portfolios/accounts). Catalog assets and brokers are shared and retained.
 * Tombstone and deletion commit atomically; the tombstone has no user FK.
 */
export async function eraseAccount(userId: string, email: string, password: string): Promise<boolean> {
  const deleted = await getDb().transaction(async (tx) => {
    // Serialize with restore: both acquire the same user lock before checking
    // tombstones or mutating owned tables.
    await tx.execute(sql`select id from users where id = ${userId} for update`);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.email !== email || !(await verifyPassword(password, user.passwordHash))) {
      return false;
    }
    // Tombstone survives the user cascade and locks out stale backup publication.
    await tx.insert(erasureTombstones).values({ userId, cleanupPending: true }).onConflictDoNothing();
    const removed = await tx.delete(users).where(and(eq(users.id, userId), eq(users.email, email))).returning({ id: users.id });
    return removed.length === 1;
  });
  // Never unlink while the DB can still roll back a live owner's verified backup.
  // Do not hold the account-erasure response or the DB lock while local I/O runs.
  // The committed pending marker makes a crash before this callback recoverable.
  if (deleted) setImmediate(() => { void cleanupErasedOwner(userId); });
  return deleted;
}

/** Retryable outside the erasure transaction; a failed cleanup leaves the independent tombstone pending. */
export async function cleanupErasedOwner(userId: string): Promise<boolean> {
  try {
    const db = getDb();
    const [tombstone] = await db.select({ userId: erasureTombstones.userId }).from(erasureTombstones)
      .where(and(eq(erasureTombstones.userId, userId), eq(erasureTombstones.cleanupPending, true))).limit(1);
    if (!tombstone) return true;
    await eraseBackupFiles(userId);
    await db.update(erasureTombstones).set({ cleanupPending: false })
      .where(and(eq(erasureTombstones.userId, userId), eq(erasureTombstones.cleanupPending, true)));
    return true;
  } catch (error) {
    console.error('[Worker] Erased-owner backup cleanup pending:', error);
    return false;
  }
}

export async function retryPendingErasureCleanup(): Promise<void> {
  const db = getDb();
  let cursor = '';
  while (true) {
    const page = await db.select({ userId: erasureTombstones.userId }).from(erasureTombstones)
      .where(and(eq(erasureTombstones.cleanupPending, true), gt(erasureTombstones.userId, cursor)))
      .orderBy(asc(erasureTombstones.userId)).limit(25);
    if (!page.length) return;
    cursor = page[page.length - 1]!.userId;
    for (const item of page) await cleanupErasedOwner(item.userId);
  }
}
