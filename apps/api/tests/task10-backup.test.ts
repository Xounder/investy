import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupRuns, erasureTombstones, users } from '../src/db/schema.js';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { backupOwner, dailyBackupId } from '../src/worker/jobs/backup.js';
import { dueJobs } from '../src/worker/scheduler.js';
import { eraseBackupFiles, ownerDirectory, stageVerifiedBackup } from '../src/services/backup-storage.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: {
  findByToken: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
} }));

type RecordRow = Record<string, unknown>;
/** DB boundary emulates owner, status, transaction reads and the owner-lock erasure race. */
class BackupDb {
  owner: string;
  erased = false;
  onPublishLock?: () => Promise<void>;
  private executions = 0;
  readonly runs: RecordRow[] = [];
  constructor(owner: string) { this.owner = owner; }
  select() {
    let table: unknown;
    let predicate: unknown;
    const query = {
      from(value: unknown) { table = value; return query; },
      where(value: unknown) { predicate = value; return query; },
      orderBy() { return query; },
      limit(n: number) { return Promise.resolve(rows().slice(0, n)); },
      then(resolve: (items: RecordRow[]) => unknown) { return Promise.resolve(resolve(rows())); },
    };
    const rows = () => {
      const { values } = whereFacts(predicate);
      if (table === users) return this.erased || (values.length && !values.includes(this.owner)) ? [] : [{ id: this.owner }];
      if (table === erasureTombstones) return this.erased ? [{ userId: this.owner }] : [];
      if (table === backupRuns) return this.runs.filter((r) => values.every((v) => Object.values(r).some((x) => x === v)));
      return []; // All ten export sections exist but are empty for this owner.
    };
    return query;
  }
  insert(table: unknown) {
    expect(table).toBe(backupRuns);
    return { values: (row: RecordRow) => ({ onConflictDoNothing: async () => {
      if (!this.runs.some((r) => r.id === row.id)) this.runs.push({ ...row });
    } }) };
  }
  update(table: unknown) {
    expect(table).toBe(backupRuns);
    return { set: (patch: RecordRow) => ({ where: async (predicate: unknown) => {
      const { values } = whereFacts(predicate);
      if (!this.erased) for (const row of this.runs) {
        if (values.includes(row.id) && values.includes(row.userId)) Object.assign(row, patch);
      }
    } }) };
  }
  async transaction<T>(callback: (tx: BackupDb) => Promise<T>): Promise<T> { return callback(this); }
  async execute(): Promise<void> {
    this.executions++;
    if (this.executions === 2) await this.onPublishLock?.();
  }
}

let owner: string;
let db: BackupDb;
const now = new Date('2026-06-01T05:00:00.000Z');
beforeEach(() => {
  owner = randomUUID();
  db = new BackupDb(owner);
  holder.db = db;
});
afterEach(async () => { await eraseBackupFiles(owner); });

describe('TASK-10 durable backups', () => {
  it('keeps the 0005 snapshot lossless and describes the 0006 backup migration', async () => {
    const folder = new URL('../drizzle/meta/', import.meta.url);
    const previous = JSON.parse(await readFile(new URL('0005_snapshot.json', folder), 'utf8'));
    const current = JSON.parse(await readFile(new URL('0006_snapshot.json', folder), 'utf8'));
    expect(current.prevId).toBe(previous.id);
    expect(current.id).not.toBe(previous.id);
    const { 'public.backup_runs': added, ...unchanged } = current.tables;
    expect(unchanged).toEqual(previous.tables);
    expect(current.enums).toEqual(previous.enums);
    expect(current._meta).toEqual(previous._meta);
    expect(added.columns).toMatchObject({ user_id: { notNull: true }, bytes: { type: 'bigint' },
      status: { notNull: true }, sha256: { type: 'text' } });
    expect(added.indexes).toHaveProperty('backup_runs_user_started_idx');
    expect(added.foreignKeys.backup_runs_user_id_users_id_fk.onDelete).toBe('cascade');
    const sql = await readFile(new URL('../drizzle/0006_backup_runs.sql', import.meta.url), 'utf8');
    expect(sql).toContain('"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE');
    expect(sql).toContain('"backup_runs_user_started_idx"');
  });

  it('schedules weekends, streams a real export, verifies and publishes exact bytes/hash once per day', async () => {
    expect(dueJobs(new Date('2026-06-06T05:00:00Z'))).toEqual(['backups']);
    await backupOwner(owner, now);
    const id = dailyBackupId(owner, '2026-06-01');
    const dir = await ownerDirectory(owner);
    expect(await readdir(dir)).toEqual([`${id}.json`]);
    const bytes = await readFile(`${dir}/${id}.json`);
    expect(JSON.parse(bytes.toString())).toMatchObject({ schemaVersion: 1, ownerId: owner,
      transactions: [], holdings: [], snapshots: [] });
    expect(db.runs).toMatchObject([{ id, userId: owner, status: 'verified', bytes: BigInt(bytes.length),
      sha256: createHash('sha256').update(bytes).digest('hex') }]);
    await backupOwner(owner, now);
    expect(db.runs).toHaveLength(1);
    expect(await readdir(dir)).toEqual([`${id}.json`]);
  });

  it('rejects corrupt/schema-invalid and oversized streams, leaving no verified artifact', async () => {
    const dir = await ownerDirectory(owner);
    const corrupt = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, ownerId: owner, holdings: [{ id: 'forged' }] })));
      controller.close();
    } });
    await expect(stageVerifiedBackup(owner, corrupt, dir)).rejects.toThrow('INVALID_EXPORT');
    expect(await readdir(dir)).toEqual([]);
    const oversized = new ReadableStream<Uint8Array>({ start(controller) {
      for (let i = 0; i < 33; i++) controller.enqueue(new Uint8Array(1024 * 1024));
      controller.close();
    } });
    await expect(stageVerifiedBackup(owner, oversized, dir)).rejects.toThrow('size limit');
    expect(await readdir(dir)).toEqual([]);
    expect(db.runs).toEqual([]);
  });

  it('blocks publication if the owner is erased after the export but before publish lock', async () => {
    db.onPublishLock = async () => {
      db.erased = true;
      db.runs.length = 0; // ON DELETE CASCADE after the erasure tombstone.
      await eraseBackupFiles(owner);
    };
    await expect(backupOwner(owner, now)).rejects.toThrow('missing or erased');
    expect(db.runs).toEqual([]);
    const dir = await ownerDirectory(owner);
    expect(await readdir(dir)).toEqual([]);
    await expect(stat(`${dir}/${dailyBackupId(owner, '2026-06-01')}.json`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns only authenticated owner status; failed storage never becomes verified', async () => {
    const request = (userId: string) => app.request('/api/v1/settings/backups', {
      headers: { Cookie: `session=${createSessionToken(userId)}` },
    });
    expect((await app.request('/api/v1/settings/backups')).status).toBe(401);
    expect(await (await request(owner)).json()).toMatchObject({ status: 'not_configured', lastBackup: null });
    process.env.BACKUP_DIR = '../outside-project';
    try {
      await expect(backupOwner(owner, now)).rejects.toThrow('BACKUP_DIR must be inside');
      expect(db.runs).toMatchObject([{ status: 'failed' }]);
      expect(db.runs[0]).not.toHaveProperty('sha256');
      expect(await (await request(owner)).json()).toMatchObject({ status: 'failed', lastBackup: null });
    } finally { delete process.env.BACKUP_DIR; }
    await backupOwner(owner, now);
    const mine = await (await request(owner)).json() as Record<string, unknown>;
    expect(mine).toMatchObject({ status: 'verified', lastBackup: {
      sha256: db.runs[0]?.sha256, bytes: db.runs[0]?.bytes?.toString(),
    } });
    expect(JSON.stringify(mine)).not.toContain('.data');
    const other = await (await request(randomUUID())).json();
    expect(other).toMatchObject({ status: 'not_configured', lastBackup: null });
  });
});
