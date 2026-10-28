import { createHash } from 'node:crypto';
import { asc, and, eq, gt, inArray, sql } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import { getDb } from '../../db/client.js';
import { backupRuns, erasureTombstones, users } from '../../db/schema.js';
import { exportStream } from '../../services/export.js';
import { localTime } from '../scheduler.js';
import { ownerDirectory, publishBackup, stageVerifiedBackup, verifiedBackupExists } from '../../services/backup-storage.js';
import { retryPendingErasureCleanup } from '../../services/erasure.js';

/** A single verified backup per São Paulo civil day; retry failed attempts. */
export function dailyBackupId(userId: string, day: string): string {
  const hex = createHash('sha256').update(JSON.stringify([userId, day])).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Only the publish step runs under the lock also acquired by account erasure. */
export async function backupOwner(userId: string, now = new Date()): Promise<void> {
  const id = dailyBackupId(userId, localTime(now).date);
  const db = getDb();
  const [existing] = await db.select().from(backupRuns)
    .where(and(eq(backupRuns.userId, userId), eq(backupRuns.id, id))).limit(1);
  if (existing?.status === 'verified') {
    if (await verifiedBackupExists(userId, id, existing.bytes, existing.sha256)) return;
    await db.update(backupRuns).set({ status: 'unavailable', finishedAt: new Date(),
      error: 'Published artifact missing or corrupt' })
      .where(and(eq(backupRuns.id, id), eq(backupRuns.userId, userId), eq(backupRuns.status, 'verified')));
  }
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  const [erased] = await db.select({ userId: erasureTombstones.userId }).from(erasureTombstones)
    .where(eq(erasureTombstones.userId, userId)).limit(1);
  if (!owner || erased) return;
  await db.insert(backupRuns).values({ id, userId, status: 'running', startedAt: now })
    .onConflictDoNothing();
  if (existing?.status === 'failed' || existing?.status === 'unavailable' || existing?.status === 'verified') {
    await db.update(backupRuns).set({ status: 'running', startedAt: now, finishedAt: null, error: null })
      .where(and(eq(backupRuns.id, id), eq(backupRuns.userId, userId),
        inArray(backupRuns.status, ['failed', 'unavailable'])));
  }
  let temporary: string | undefined;
  try {
    const dir = await ownerDirectory(userId);
    const staged = await stageVerifiedBackup(userId, exportStream(userId, 'json'), dir);
    temporary = staged.temporary;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from users where id = ${userId} for update`);
      const [locked] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      const [tombstone] = await tx.select({ userId: erasureTombstones.userId }).from(erasureTombstones)
        .where(eq(erasureTombstones.userId, userId)).limit(1);
      if (!locked || tombstone) throw new Error('Backup owner missing or erased');
      const [current] = await tx.select().from(backupRuns)
        .where(and(eq(backupRuns.id, id), eq(backupRuns.userId, userId))).limit(1);
      if (current?.status === 'verified' && await verifiedBackupExists(userId, id, current.bytes, current.sha256)) return;
      if (!current) throw new Error('Backup status missing');
      // The prior artifact may have been corrupt. Replace it only under the owner lock.
      await rm(`${dir}/${id}.json`, { force: true });
      await publishBackup(dir, id, staged);
      temporary = undefined;
      try {
        await tx.update(backupRuns).set({ status: 'verified', finishedAt: new Date(), bytes: BigInt(staged.bytes),
          sha256: staged.checksum, error: null }).where(and(eq(backupRuns.id, id), eq(backupRuns.userId, userId)));
      } catch (error) {
        await rm(`${dir}/${id}.json`, { force: true });
        throw error;
      }
    });
  } catch (error) {
    // Do not recreate a status after erasure; the FK cascade removes it.
    // Public metadata must not include provider errors, paths or customer data.
    await db.update(backupRuns).set({ status: 'failed', finishedAt: new Date(), error: 'Backup verification or storage failed' })
      .where(and(eq(backupRuns.id, id), eq(backupRuns.userId, userId), eq(backupRuns.status, 'running')));
    throw error;
  } finally {
    if (temporary) await rm(temporary, { force: true });
  }
}

/** Cursor pagination, independent failures, no owner data in structured logs. */
export async function backupAllOwners(now = new Date()): Promise<void> {
  await retryPendingErasureCleanup();
  const db = getDb();
  let cursor = '';
  let succeeded = 0, failed = 0;
  while (true) {
    const page = await db.select({ id: users.id }).from(users)
      .where(gt(users.id, cursor)).orderBy(asc(users.id)).limit(25);
    if (!page.length) break;
    cursor = page[page.length - 1]!.id;
    for (const owner of page) {
      try { await backupOwner(owner.id, now); succeeded++; }
      catch (error) {
        failed++;
        console.error('[Worker] Backup failed:', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  console.info('[Worker] Backups:', { succeeded, failed });
  if (failed) throw new Error(`${failed} backup(s) failed`);
}
