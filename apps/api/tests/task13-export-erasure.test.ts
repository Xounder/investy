import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { csvArchive, csvCell, exportPages, exportStream, jsonExport } from '../src/services/export.js';
import { eraseAccount } from '../src/services/erasure.js';
import { accounts, assets, brokers, dividends, holdings, notaimports, portfolios, portfolioSnapshots, quoteOverrides, transactions, users } from '../src/db/schema.js';
import { createFakeDb } from './helpers/fake-db.js';
import { whereFacts } from './helpers/sql-facts.js';
import { getTableColumns } from 'drizzle-orm';
import { restoreExport, validateRestorePayload } from '../src/services/restore.js';
import { erasureTombstones } from '../src/db/schema.js';

const { holder, findSession, verify } = vi.hoisted(() => ({ holder: { db: null as unknown }, findSession: vi.fn(), verify: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));
vi.mock('../src/lib/password.js', () => ({ verifyPassword: verify }));

const db = createFakeDb();
holder.db = db;
const tableMap = { portfolios, brokers, accounts, assets, transactions, dividends, holdings, overrides: quoteOverrides, snapshots: portfolioSnapshots, notaImports: notaimports };
function req(user: string, path: string, method = 'GET', body?: unknown) {
  return app.request(`/api/v1${path}`, { method, headers: { Cookie: `session=${createSessionToken(user)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function collect(iter: AsyncGenerator<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of iter) chunks.push(chunk);
  const result = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

beforeEach(() => {
  db.reset();
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  verify.mockReset();
});

describe('TASK-13 owned data export', () => {
  it('exports every owned table, catalogs limited by owned references, and serializes bigint losslessly', async () => {
    for (const [key, table] of Object.entries(tableMap)) db.setResults(table, [{ id: key, userId: 'alice', priceCents: 9007199254740993n }]);
    const result = JSON.parse(new TextDecoder().decode(await collect(jsonExport('alice'))));
    expect(result.schemaVersion).toBe(1);
    for (const key of Object.keys(tableMap)) expect(result[key][0].priceCents).toBe('9007199254740993');
    for (const capture of db.getWhereCaptures()) {
      const facts = whereFacts(capture.where);
      expect(facts.values).toContain('alice');
      expect(facts.values).not.toContain('bob');
    }
    expect(Object.keys(result)).not.toContain('sessions');
  });

  it('paginates each table by id and serializes empty exports', async () => {
    const page = vi.fn(async (_user: string, cursor: string) => cursor ? [] : [{ id: 'first', qty: 123n }]);
    const data = JSON.parse(new TextDecoder().decode(await collect(jsonExport('alice', { journal: page }))));
    expect(data).toEqual({ schemaVersion: 1, ownerId: 'alice', journal: [{ id: 'first', qty: '123' }] });
    expect(page).toHaveBeenCalledWith('alice', '');
    expect(JSON.parse(new TextDecoder().decode(await collect(jsonExport('alice', { empty: async () => [] }))))).toEqual({ schemaVersion: 1, ownerId: 'alice', empty: [] });
    expect(Object.keys(exportPages)).toContain('notaImports');
  });

  it('makes a valid ZIP of four pt-BR CSV modules with escaped strings', async () => {
    expect(csvCell('a;"b"\r\nc')).toBe('"a;""b""\r\nc"');
    const pages = Object.fromEntries(Object.keys(exportPages).map((key) => [key, async () => key === 'transactions' ? [{ id: 'x', notes: 'a;"b"\r\nc', qty: 5n }] : []])) as typeof exportPages;
    const archive = await collect(csvArchive('alice', pages));
    const text = new TextDecoder().decode(archive);
    for (const name of ['holdings.csv', 'transactions.csv', 'dividends.csv', 'performance.csv']) expect(text).toContain(name);
    expect(text).toContain('"Carteira";"Conta"');
    expect(text).toContain('"a;""b""\r\nc"');
    const view = new DataView(archive.buffer);
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(archive.length - 12, true)).toBe(4);
  });

  it('requires authentication, validates format and reports missing backup metadata honestly', async () => {
    expect((await app.request('/api/v1/export?format=json', { method: 'POST' })).status).toBe(401);
    expect((await req('alice', '/export?format=pdf', 'POST')).status).toBe(400);
    const backup = await req('alice', '/settings/backups');
    expect(await backup.json()).toMatchObject({ lastBackup: null, status: 'not_configured' });
    db.setResults(quoteOverrides, [{ id: 'override', userId: 'alice', priceCents: 42n }]);
    expect(await (await req('alice', '/settings/overrides')).json()).toEqual({ overrides: [{ id: 'override', userId: 'alice', priceCents: '42' }] });
    expect(whereFacts(db.getWhereCaptures()[0]?.where).values).toContain('alice');
  });
});

describe('TASK-13 erasure', () => {
  it('rejects wrong confirmation without deletion and deletes user in one transaction on match', async () => {
    let deleted = false;
    const tx = {
      execute: async () => undefined,
      insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'alice', email: 'a@example.com', passwordHash: 'hash' }] }) }) }),
      delete: (table: unknown) => {
        expect(table).toBe(users);
        return { where: () => ({ returning: async () => { deleted = true; return [{ id: 'alice' }]; } }) };
      },
    };
    holder.db = { transaction: async (fn: (db: typeof tx) => Promise<boolean>) => fn(tx) };
    verify.mockResolvedValue(true);
    expect(await eraseAccount('alice', 'wrong@example.com', 'secret')).toBe(false);
    expect(deleted).toBe(false);
    expect(await eraseAccount('alice', 'a@example.com', 'secret')).toBe(true);
    expect(verify).toHaveBeenCalledWith('secret', 'hash');
    expect(deleted).toBe(true);
    holder.db = db;
  });

  it('requires a typed email and password, revokes the session after atomic erasure', async () => {
    let deleted = false;
    const tx = {
      execute: async () => undefined,
      insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'alice', email: 'a@example.com', passwordHash: 'hash' }] }) }) }),
      delete: () => ({ where: () => ({ returning: async () => { deleted = true; return [{ id: 'alice' }]; } }) }),
    };
    holder.db = { transaction: async (fn: (db: typeof tx) => Promise<boolean>) => fn(tx) };
    findSession.mockImplementation(async () => deleted ? null : { expiresAt: new Date(Date.now() + 60_000) });
    verify.mockResolvedValue(true);
    try {
      expect((await req('alice', '/settings/account', 'DELETE', { email: 'a@example.com' })).status).toBe(400);
      expect((await req('alice', '/settings/account', 'DELETE', { email: 'wrong@example.com', password: 'secret' })).status).toBe(403);
      expect(deleted).toBe(false);
      const res = await req('alice', '/settings/account', 'DELETE', { email: 'a@example.com', password: 'secret' });
      expect(res.status).toBe(204);
      expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
      expect((await req('alice', '/settings/backups')).status).toBe(401);
    } finally { holder.db = db; }
  });
});

describe('TASK-13 internal restore contract', () => {
  const owner = 'alice';
  const makeRow = (table: (typeof tableMap)[keyof typeof tableMap], id: string, fields: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {};
    for (const [name, column] of Object.entries(getTableColumns(table))) {
      row[name] = name === 'id' ? id : name === 'userId' ? owner : column.dataType === 'bigint' ? '9007199254740993' :
        column.dataType === 'date' ? '2026-01-01T00:00:00.000Z' : column.dataType === 'boolean' ? false :
        column.dataType === 'number' ? 1 : column.dataType === 'json' ? {} : column.notNull ? 'test' : null;
    }
    return { ...row, ...fields, id };
  };
  const fixture = () => ({
    schemaVersion: 1, ownerId: owner,
    brokers: [makeRow(brokers, 'broker', { name: 'Broker', code: 'BRK' })],
    assets: [makeRow(assets, 'asset', { name: 'Asset', symbol: 'ASST3', class: 'stock', currency: 'BRL' })],
    portfolios: [makeRow(portfolios, 'portfolio', { name: 'Main', currency: 'BRL' })],
    accounts: [makeRow(accounts, 'account', { portfolioId: 'portfolio', brokerId: 'broker', name: 'Main' })],
    notaImports: [makeRow(notaimports, 'nota', { brokerId: 'broker', notaNumber: '1', status: 'confirmed' })],
    dividends: [makeRow(dividends, 'dividend', { portfolioId: 'portfolio', assetId: 'asset', kind: 'dividend', status: 'paid', source: 'manual' })],
    transactions: [makeRow(transactions, 'trade', { accountId: 'account', portfolioId: 'portfolio', assetId: 'asset', dividendId: 'dividend', notaRefId: 'nota', type: 'dividend', currency: 'BRL', fxRateToBRL: null, amortRateCents: null, source: 'nota', qty: '1', feeCents: '0', realizedPnlCents: '0' })],
    holdings: [makeRow(holdings, 'holding', { accountId: 'account', assetId: 'asset', qty: '0', avgPriceCents: '0', costBasisCents: '0' })],
    overrides: [makeRow(quoteOverrides, 'override', { assetId: 'asset', currency: 'BRL' })],
    snapshots: [makeRow(portfolioSnapshots, 'snapshot', { portfolioId: 'portfolio', allocationJsonb: { stocks: '9007199254740993' } })],
  });

  it('validates an actual JSON export roundtrip and converts bigint cents and timestamps back without precision loss', async () => {
    const rows = fixture();
    const pages = Object.fromEntries(Object.keys(tableMap).map((key) => [key, async () => rows[key as keyof typeof tableMap]])) as typeof exportPages;
    const exported = JSON.parse(new TextDecoder().decode(await collect(jsonExport(owner, pages))));
    const parsed = validateRestorePayload(exported, owner);
    expect(parsed.transactions[0]!.unitPriceCents).toBe(9007199254740993n);
    expect(parsed.transactions[0]!.dividendId).toBe('dividend');
    expect(parsed.transactions[0]!.notaRefId).toBe('nota');
    expect(parsed.snapshots[0]!.allocationJsonb).toEqual({ stocks: '9007199254740993' });
    expect(parsed.snapshots[0]!.date).toBeInstanceOf(Date);
    expect(() => validateRestorePayload(exported, 'bob')).toThrow('INVALID_EXPORT');
    expect(() => validateRestorePayload({ ...exported, schemaVersion: 200 }, owner)).toThrow('INVALID_EXPORT');
    expect(() => validateRestorePayload({ ...exported, transactions: [{ ...exported.transactions[0], assetId: 'foreign' }] }, owner)).toThrow('missing reference');
    expect(() => validateRestorePayload({ ...exported, transactions: [{ ...exported.transactions[0], notaRefId: 'foreign' }] }, owner)).toThrow('transactions.notaRefId');
    expect(() => validateRestorePayload({ ...exported, notaImports: [] }, owner)).toThrow('transactions.notaRefId');
  });

  it('checks the tombstone under the transaction owner lock before writing any archived row', async () => {
    const rows = fixture();
    const captures: string[] = [];
    const tx = {
      execute: async () => { captures.push('lock'); },
      select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => {
        captures.push(table === erasureTombstones ? 'tombstone' : 'owner');
        return table === users ? [{ id: owner }] : table === erasureTombstones ? [{ userId: owner }] : [];
      } }) }) }),
      insert: () => { captures.push('write'); throw new Error('should not write'); },
    };
    holder.db = { transaction: async (fn: (client: typeof tx) => Promise<void>) => fn(tx) };
    try {
      await expect(restoreExport(owner, rows)).rejects.toThrow('RESTORE_FORBIDDEN');
      expect(captures).toEqual(['lock', 'owner', 'tombstone']);
    } finally { holder.db = db; }
  });
});

describe('TASK-13 snapshot streaming lifecycle', () => {
  it('reads under one repeatable-read transaction and releases it on cancellation', async () => {
    let committed = false;
    const statements: string[] = [];
    db.setResults(users, [{ id: 'alice' }]);
    db.setResults(erasureTombstones, []);
    const transactional = {
      execute: async (statement: unknown) => { statements.push(String(statement)); },
      select: db.select.bind(db),
    };
    holder.db = { transaction: async (fn: (tx: typeof transactional) => Promise<void>) => {
      try { await fn(transactional); } finally { committed = true; }
    } };
    try {
      const reader = exportStream('alice').getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('schemaVersion');
      expect(committed).toBe(false);
      expect(statements).toHaveLength(1);
      await reader.cancel();
      expect(committed).toBe(true);
      expect(db.getWhereCaptures().filter((capture) => capture.table === users || capture.table === erasureTombstones)).toHaveLength(2);
    } finally { holder.db = db; }
  });

  it('evaluates scoped row predicates against interleaved owners and keeps B out of A export', async () => {
    const data = new Map<unknown, { id: string; userId?: string; assetId?: string; brokerId?: string }[]>([
      [users, [{ id: 'alice' }, { id: 'bob' }]], [erasureTombstones, []],
      [portfolios, [{ id: 'pA', userId: 'alice' }, { id: 'pB', userId: 'bob' }]],
      [accounts, [{ id: 'aA', userId: 'alice', brokerId: 'bA' }, { id: 'aB', userId: 'bob', brokerId: 'bB' }]],
      [brokers, [{ id: 'bA' }, { id: 'bB' }]], [assets, [{ id: 'sA' }, { id: 'sB' }]],
      [transactions, [{ id: 'tA', userId: 'alice', assetId: 'sA' }, { id: 'tB', userId: 'bob', assetId: 'sB' }]],
    ]);
    const select = () => {
      let table: unknown;
      let predicate: unknown;
      let count = 200;
      const query = {
        from(value: unknown) { table = value; return query; },
        where(value: unknown) { predicate = value; return query; },
        orderBy() { return query; },
        limit(value: number) { count = value; return query; },
        then(resolve: (rows: object[]) => unknown) {
          const facts = whereFacts(predicate);
          const user = facts.values.find((v) => v === 'alice' || v === 'bob') as string | undefined;
          const cursor = facts.columns.includes('id') && table !== users && table !== erasureTombstones ?
            String(facts.values.find((v) => v !== user) ?? '') : '';
          const referenced = new Set(table === assets ? (data.get(transactions) ?? []).filter((row) => row.userId === user).map((row) => row.assetId) :
            (data.get(accounts) ?? []).filter((row) => row.userId === user).map((row) => row.brokerId));
          const rows = (data.get(table) ?? []).filter((row) => {
            if (table === users || table === erasureTombstones) return row.id === user;
            if (row.id <= cursor) return false;
            return table === assets || table === brokers ? referenced.has(row.id) : row.userId === user;
          });
          return Promise.resolve(resolve(rows.slice(0, count)));
        },
      };
      return query;
    };
    const client = { select, execute: async () => undefined };
    holder.db = { transaction: async (fn: (tx: typeof client) => Promise<void>) => fn(client) };
    try {
      const data = JSON.parse(await new Response(exportStream('alice')).text());
      expect(data.portfolios.map((row: { id: string }) => row.id)).toEqual(['pA']);
      expect(data.transactions.map((row: { id: string }) => row.id)).toEqual(['tA']);
      expect(data.assets.map((row: { id: string }) => row.id)).toEqual(['sA']);
      expect(data.brokers.map((row: { id: string }) => row.id)).toEqual(['bA']);
      expect(JSON.stringify(data)).not.toContain('pB');
      expect(JSON.stringify(data)).not.toContain('sB');
    } finally { holder.db = db; }
  });
});
