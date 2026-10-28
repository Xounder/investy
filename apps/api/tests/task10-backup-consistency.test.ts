import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { backupRuns, erasureTombstones, users } from '../src/db/schema.js';
import { createSessionToken } from '../src/lib/session.js';
import { eraseAccount, retryPendingErasureCleanup } from '../src/services/erasure.js';
import { ownerDirectory, eraseBackupFiles } from '../src/services/backup-storage.js';
import { backupOwner, dailyBackupId } from '../src/worker/jobs/backup.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/lib/password.js', () => ({ verifyPassword: async () => true }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: {
  findByToken: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
} }));

type Run = { id: string; userId: string; status: string; startedAt: Date;
  bytes?: bigint | null; sha256?: string | null; finishedAt?: Date | null; error?: string | null };
type Tombstone = { userId: string; cleanupPending: boolean; erasedAt: Date };
class ConsistencyDb {
  readonly tombstoneLookups: unknown[][] = [];
  owner: string;
  alive = true;
  tombstone: Tombstone | null = null;
  runs: Run[] = [];
  failDelete = false;
  failCommit = false;
  constructor(owner: string) { this.owner = owner; }
  select() {
    let table: unknown;
    let predicate: unknown;
    let reversed = false;
    const query = {
      from(value: unknown) { table = value; return query; },
      where(value: unknown) { predicate = value; return query; },
      orderBy() { reversed = true; return query; },
      limit(count: number) { return Promise.resolve(rows().slice(0, count)); },
      then(resolve: (items: unknown[]) => unknown) { return Promise.resolve(resolve(rows())); },
    };
    const rows = () => {
      const { values } = whereFacts(predicate);
      if (table === users) return this.alive && (!values.length || values.includes(this.owner)) ?
        [{ id: this.owner, email: 'owner@example.com', passwordHash: 'hash' }] : [];
      if (table === erasureTombstones) this.tombstoneLookups.push(values);
      if (table === erasureTombstones) return this.tombstone &&
        (!values.length || values.every((v) => v === this.owner || v === true || v === '' || v === this.tombstone?.cleanupPending)) &&
        (!values.includes(true) || this.tombstone.cleanupPending) ? [this.tombstone] : [];
      if (table === backupRuns) {
        const selected = this.runs.filter((row) => values.every((value) => (Object.values(row) as unknown[]).includes(value)));
        return reversed ? selected.slice().reverse() : selected;
      }
      return []; // Empty but complete export sections.
    };
    return query;
  }
  async execute(): Promise<void> { }
  async transaction<T>(callback: (tx: ConsistencyDb) => Promise<T>): Promise<T> {
    const copy = { alive: this.alive, tombstone: structuredClone(this.tombstone), runs: structuredClone(this.runs) };
    try {
      const result = await callback(this);
      if (this.failCommit) throw new Error('injected commit failure');
      return result;
    } catch (error) {
      this.alive = copy.alive;
      this.tombstone = copy.tombstone;
      this.runs = copy.runs;
      throw error;
    }
  }
  insert(table: unknown) {
    return { values: (row: Record<string, unknown>) => ({ onConflictDoNothing: async () => {
      if (table === backupRuns) {
        if (!this.runs.some((item) => item.id === row.id)) this.runs.push({ ...row } as Run);
      } else if (table === erasureTombstones && !this.tombstone) {
        this.tombstone = { userId: this.owner, cleanupPending: true, erasedAt: new Date() };
      } else if (table !== erasureTombstones) throw new Error('Unexpected insert');
    } }) };
  }
  update(table: unknown) {
    return { set: (patch: Record<string, unknown>) => ({ where: async (predicate: unknown) => {
      const { values } = whereFacts(predicate);
      if (table === erasureTombstones && this.tombstone && values.includes(this.owner)) Object.assign(this.tombstone, patch);
      else if (table === backupRuns) for (const row of this.runs) {
        if (values.includes(row.id) && values.includes(row.userId)) Object.assign(row, patch);
      }
    } }) };
  }
  delete(table: unknown) {
    expect(table).toBe(users);
    return { where: () => ({ returning: async () => {
      if (this.failDelete) throw new Error('injected delete failure');
      this.alive = false; this.runs = [];
      return [{ id: this.owner }];
    } }) };
  }
}

let owner: string;
let db: ConsistencyDb;
const now = new Date('2026-06-01T05:00:00Z');
const request = (id: string) => app.request('/api/v1/settings/backups', {
  headers: { Cookie: `session=${createSessionToken(id)}` },
});
beforeEach(() => { owner = randomUUID(); db = new ConsistencyDb(owner); holder.db = db; });
afterEach(async () => { delete process.env.BACKUP_DIR; await eraseBackupFiles(owner); });

describe('TASK-10/13 published backup consistency', () => {
  it('preserves a live owner, verified row and artifact on deletion OR commit rollback', async () => {
    await backupOwner(owner, now);
    const path = `${await ownerDirectory(owner)}/${dailyBackupId(owner, '2026-06-01')}.json`;
    const contents = await readFile(path);
    for (const failure of ['failDelete', 'failCommit'] as const) {
      db[failure] = true;
      await expect(eraseAccount(owner, 'owner@example.com', 'secret')).rejects.toThrow();
      db[failure] = false;
      expect(db.alive).toBe(true);
      expect(db.tombstone).toBeNull();
      expect(db.runs[0]?.status).toBe('verified');
      expect(await readFile(path)).toEqual(contents);
    }
  });

  it('commits erasure first, persists pending cleanup after FS failure, then retries idempotently', async () => {
    await backupOwner(owner, now);
    const dir = await ownerDirectory(owner);
    process.env.BACKUP_DIR = '../outside-project';
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await eraseAccount(owner, 'owner@example.com', 'secret')).toBe(true);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    finally { log.mockRestore(); delete process.env.BACKUP_DIR; }
    expect(db.alive).toBe(false);
    expect(db.runs).toEqual([]);
    expect(db.tombstone).toMatchObject({ userId: owner, cleanupPending: true });
    expect(await readdir(dir)).toHaveLength(1);
    await retryPendingErasureCleanup();
    expect(db.tombstone?.cleanupPending, JSON.stringify(db.tombstoneLookups)).toBe(false);
    await expect(stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    await retryPendingErasureCleanup();
    expect(db.tombstone?.cleanupPending).toBe(false);
  });

  it('downgrades missing or corrupt artifacts in GET and repairs on the same-day worker run', async () => {
    await backupOwner(owner, now);
    const id = dailyBackupId(owner, '2026-06-01');
    const path = `${await ownerDirectory(owner)}/${id}.json`;
    for (const damage of ['deleted', 'corrupted'] as const) {
      if (damage === 'deleted') await rm(path);
      else {
        const bytes = await readFile(path);
        bytes[bytes.length - 2] = bytes[bytes.length - 2] === 125 ? 97 : 125;
        await writeFile(path, bytes);
      }
      expect(await (await request(owner)).json()).toMatchObject({ lastBackup: null,
        status: 'unavailable', reason: 'artifact_missing_or_corrupt' });
      expect(db.runs[0]?.status).toBe('unavailable');
      await backupOwner(owner, now);
      expect(db.runs).toHaveLength(1);
      expect(db.runs[0]?.status).toBe('verified');
      const file = await readFile(path);
      expect(db.runs[0]?.sha256).toBe(createHash('sha256').update(file).digest('hex'));
      expect(await (await request(owner)).json()).toMatchObject({ status: 'verified',
        lastBackup: { sha256: db.runs[0]?.sha256 }, reason: null });
      expect(await (await request(randomUUID())).json()).toMatchObject({ lastBackup: null, status: 'not_configured' });
    }
  });

  it('adds only the tombstone cleanup marker to the lossless 0008 snapshot', async () => {
    const meta = new URL('../drizzle/meta/', import.meta.url);
    const previous = JSON.parse(await readFile(new URL('0007_snapshot.json', meta), 'utf8'));
    const current = JSON.parse(await readFile(new URL('0008_snapshot.json', meta), 'utf8'));
    expect(current.prevId).toBe(previous.id);
    const { 'public.erasure_tombstones': table, ...others } = current.tables;
    expect(others).toEqual(Object.fromEntries(Object.entries(previous.tables).filter(([name]) => name !== 'public.erasure_tombstones')));
    const { cleanup_pending: marker, ...columns } = table.columns;
    expect(columns).toEqual(previous.tables['public.erasure_tombstones'].columns);
    expect(marker).toMatchObject({ type: 'boolean', notNull: true, default: true });
  });
});
