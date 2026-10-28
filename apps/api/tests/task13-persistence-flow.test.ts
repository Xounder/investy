import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { accounts, assets, brokers, dividends, erasureTombstones, holdings, notaimports,
  portfolios, portfolioSnapshots, quoteOverrides, sessions, transactions, users } from '../src/db/schema.js';
import { exportStream } from '../src/services/export.js';
import { restoreExport } from '../src/services/restore.js';
import { eraseAccount } from '../src/services/erasure.js';
import { getUserOverrides } from '../src/services/market-data/overrides.js';
import { Task13Db } from './helpers/task13-db.js';

const { holder, verify } = vi.hoisted(() => ({ holder: { db: null as unknown }, verify: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/lib/password.js', () => ({ verifyPassword: verify }));

type Row = Record<string, unknown> & { id: string };
const make = (table: typeof portfolios | typeof accounts | typeof transactions | typeof dividends |
  typeof holdings | typeof notaimports | typeof quoteOverrides | typeof portfolioSnapshots |
  typeof assets | typeof brokers, id: string, fields: Record<string, unknown> = {}): Row => {
  const row: Row = { id };
  for (const [name, column] of Object.entries(getTableColumns(table))) {
    if (name === 'id') continue;
    row[name] = column.dataType === 'bigint' ? 9007199254740993n :
      column.dataType === 'date' ? new Date('2026-04-20T12:00:00.000Z') :
        column.dataType === 'boolean' ? false : column.dataType === 'json' ? { allocation: 'exact' } :
          column.dataType === 'number' ? 1 : column.notNull ? 'value' : null;
  }
  return { ...row, ...fields };
};

const tables = { brokers, assets, portfolios, accounts, notaImports: notaimports, dividends,
  transactions, holdings, overrides: quoteOverrides, snapshots: portfolioSnapshots };
function populated(owner: 'alice' | 'bob') {
  const label = owner === 'alice' ? 'A' : 'B';
  const data = {
    brokers: [make(brokers, `broker${label}`, { name: `Broker ${label}`, code: label })],
    assets: [make(assets, `asset${label}`, { name: `Asset ${label}`, symbol: `ASST${label}`, class: 'acao', currency: 'BRL' })],
    portfolios: [make(portfolios, `portfolio${label}`, { userId: owner, name: `Portfolio ${label}`, currency: 'BRL' })],
    accounts: [make(accounts, `account${label}`, { userId: owner, portfolioId: `portfolio${label}`, brokerId: `broker${label}`, name: `Account ${label}` })],
    notaImports: [make(notaimports, `nota${label}`, { userId: owner, brokerId: `broker${label}`, status: 'confirmed', notaNumber: label })],
    dividends: [make(dividends, `dividend${label}`, { userId: owner, portfolioId: `portfolio${label}`, assetId: `asset${label}`, kind: 'dividend', status: 'paid', source: 'manual', rateCentsPerUnit: 2n })],
    transactions: [
      make(transactions, `buy${label}`, { userId: owner, accountId: `account${label}`, portfolioId: `portfolio${label}`, assetId: `asset${label}`, type: 'buy', qty: 1n, unitPriceCents: 9007199254740993n, feeCents: 0n, realizedPnlCents: 0n, currency: 'BRL', fxRateToBRL: null, amortRateCents: null, source: 'manual', date: new Date('2026-04-19T12:00:00.000Z') }),
      make(transactions, `trade${label}`, { userId: owner, accountId: `account${label}`, portfolioId: `portfolio${label}`, assetId: `asset${label}`, type: 'dividend', dividendId: `dividend${label}`, notaRefId: `nota${label}`, qty: 1n, unitPriceCents: 2n, feeCents: 0n, realizedPnlCents: 0n, currency: 'BRL', fxRateToBRL: null, amortRateCents: null, source: 'nota' }),
    ],
    holdings: [make(holdings, `holding${label}`, { userId: owner, accountId: `account${label}`, assetId: `asset${label}`, qty: 1n, avgPriceCents: 9007199254740993n, costBasisCents: 9007199254740993n, realizedPnlCents: 2n })],
    overrides: [make(quoteOverrides, `override${label}`, { userId: owner, assetId: `asset${label}`, currency: 'BRL' })],
    snapshots: [make(portfolioSnapshots, `snapshot${label}`, { userId: owner, portfolioId: `portfolio${label}`, allocationJsonb: { stocksCents: '9007199254740993' } })],
  };
  return data;
}
function seed(db: Task13Db, data: ReturnType<typeof populated>) {
  for (const [section, table] of Object.entries(tables)) db.seed(table, ...data[section as keyof typeof data]);
}

let db: Task13Db;
beforeEach(() => {
  db = new Task13Db();
  holder.db = db;
  verify.mockImplementation(async (password: string, hash: string) => password === 'secret' && hash === 'hash');
});

describe('TASK-13 actual services against transactional row store (not live PostgreSQL)', () => {
  it('exports a two-owner store, restores into an empty existing owner in FK order with exact cents and receipt/nota links', async () => {
    db.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'hash' }, { id: 'bob', email: 'bob@example.com', passwordHash: 'hash' });
    db.seed(sessions, { id: 'sessionA', userId: 'alice', token: 'secretA' }, { id: 'sessionB', userId: 'bob', token: 'secretB' });
    const a = populated('alice');
    seed(db, a);
    seed(db, populated('bob'));
    const archive = JSON.parse(await new Response(exportStream('alice')).text());
    for (const [section, rows] of Object.entries(a)) expect(archive[section].map((row: Row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(archive.transactions[0].unitPriceCents).toBe('9007199254740993');
    expect(archive.transactions[1].dividendId).toBe('dividendA');
    expect(archive.transactions[1].notaRefId).toBe('notaA');
    expect(archive.snapshots[0].allocationJsonb).toEqual({ stocksCents: '9007199254740993' });
    expect(JSON.stringify(archive)).not.toContain('bob');
    expect(JSON.stringify(archive)).not.toContain('secret');
    expect((await getUserOverrides('alice')).map((r) => r.id)).toEqual(['overrideA']);
    expect((await getUserOverrides('bob')).map((r) => r.id)).toEqual(['overrideB']);

    const target = new Task13Db();
    target.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'new-private-hash' });
    holder.db = target;
    await restoreExport('alice', archive);
    expect(target.writes).toEqual(['brokers', 'assets', 'portfolios', 'accounts', 'notaImports',
      'dividends', 'transactions', 'transactions', 'holdings', 'overrides', 'snapshots']);
    expect(target.rows(transactions)[0]).toMatchObject({ id: 'buyA', unitPriceCents: 9007199254740993n });
    expect(target.rows(transactions)[1]).toMatchObject({ id: 'tradeA', dividendId: 'dividendA', notaRefId: 'notaA', qty: 1n });
    expect(target.rows(quoteOverrides)[0]?.priceCents).toBe(9007199254740993n);
    expect(target.rows(portfolioSnapshots)[0]?.totalValueCents).toBe(9007199254740993n);
    expect(target.rows(sessions)).toEqual([]);
    expect(target.rows(users)[0]?.passwordHash).toBe('new-private-hash');
    expect(JSON.parse(await new Response(exportStream('alice')).text())).toEqual(archive);
  });

  it('rolls back a failed restore, including shared catalog insertions, then refuses a stale archive after erasure', async () => {
    db.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'hash' });
    seed(db, populated('alice'));
    const archive = JSON.parse(await new Response(exportStream('alice')).text());
    const target = new Task13Db();
    target.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'hash' });
    holder.db = target;
    target.failInsert = transactions;
    await expect(restoreExport('alice', archive)).rejects.toThrow('injected insert failure');
    expect(target.events).toContain('rollback');
    for (const table of Object.values(tables)) expect(target.rows(table)).toEqual([]);
    target.failInsert = undefined;
    expect(await eraseAccount('alice', 'wrong@example.com', 'secret')).toBe(false);
    expect(target.rows(erasureTombstones)).toEqual([]);
    target.failDelete = true;
    await expect(eraseAccount('alice', 'alice@example.com', 'secret')).rejects.toThrow('injected delete failure');
    expect(target.rows(users)).toHaveLength(1);
    expect(target.rows(erasureTombstones)).toEqual([]);
    target.failDelete = false;
    expect(await eraseAccount('alice', 'alice@example.com', 'secret')).toBe(true);
    expect(target.rows(erasureTombstones)).toMatchObject([{ userId: 'alice' }]);
    await expect(restoreExport('alice', archive)).rejects.toThrow('RESTORE_FORBIDDEN');
    await expect(new Response(exportStream('alice')).text()).rejects.toThrow('Export owner missing or erased');
  });

  it('rejects foreign nota links and schema-valid forged holdings before any write, but accepts exact historical FX replay', async () => {
    db.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'hash' }, { id: 'bob', email: 'bob@example.com', passwordHash: 'hash' });
    const a = populated('alice');
    a.transactions[0]!.currency = 'USD';
    a.transactions[0]!.fxRateToBRL = 5_250_000n;
    a.transactions[0]!.unitPriceCents = 100n;
    a.holdings[0]!.avgPriceCents = 525n;
    a.holdings[0]!.costBasisCents = 525n;
    seed(db, a);
    seed(db, populated('bob'));
    const archive = JSON.parse(await new Response(exportStream('alice')).text());
    const target = new Task13Db();
    target.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'new-hash' });
    holder.db = target;
    const badLink = structuredClone(archive);
    badLink.transactions[1].notaRefId = 'notaB';
    await expect(restoreExport('alice', badLink)).rejects.toThrow('transactions.notaRefId');
    const missingLink = structuredClone(archive);
    missingLink.notaImports = [];
    await expect(restoreExport('alice', missingLink)).rejects.toThrow('transactions.notaRefId');
    const forgedBasis = structuredClone(archive);
    forgedBasis.holdings[0].costBasisCents = '526';
    await expect(restoreExport('alice', forgedBasis)).rejects.toThrow('holding does not match journal replay');
    const forgedIncome = structuredClone(archive);
    forgedIncome.transactions[1].unitPriceCents = '3';
    await expect(restoreExport('alice', forgedIncome)).rejects.toThrow('holding does not match journal replay');
    expect(target.events).toEqual([]);
    expect(target.writes).toEqual([]);
    for (const table of Object.values(tables)) expect(target.rows(table)).toEqual([]);
    await restoreExport('alice', archive);
    expect(target.rows(holdings)[0]).toMatchObject({ id: 'holdingA', qty: 1n, avgPriceCents: 525n, costBasisCents: 525n, realizedPnlCents: 2n });
    expect(JSON.parse(await new Response(exportStream('alice')).text())).toEqual(archive);
  });

  it('deletes only A-owned tables and sessions while retaining B and shared catalogs; tombstone persists', async () => {
    db.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'hash' }, { id: 'bob', email: 'bob@example.com', passwordHash: 'hash' });
    db.seed(sessions, { id: 'sessionA', userId: 'alice' }, { id: 'sessionB', userId: 'bob' });
    seed(db, populated('alice'));
    seed(db, populated('bob'));
    expect(await eraseAccount('alice', 'alice@example.com', 'secret')).toBe(true);
    expect(db.rows(users).map((row) => row.id)).toEqual(['bob']);
    for (const [section, table] of Object.entries(tables)) {
      expect(db.rows(table).map((row) => row.id)).toEqual(section === 'assets' || section === 'brokers' ?
        [`${section === 'assets' ? 'asset' : 'broker'}A`, `${section === 'assets' ? 'asset' : 'broker'}B`] :
        populated('bob')[section as keyof ReturnType<typeof populated>].map((row) => row.id));
    }
    expect(db.rows(sessions).map((row) => row.id)).toEqual(['sessionB']);
    expect(db.rows(erasureTombstones)).toMatchObject([{ userId: 'alice' }]);
    expect(JSON.parse(await new Response(exportStream('bob')).text()).transactions.map((row: Row) => row.id)).toEqual(['buyB', 'tradeB']);
  });

  it('serializes a queued stale-backup restore behind erasure and rejects it once the tombstone commits', async () => {
    db.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'hash' });
    seed(db, populated('alice'));
    const archive = JSON.parse(await new Response(exportStream('alice')).text());
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    db.afterLock = async () => { db.afterLock = undefined; entered(); await gate; };
    const erase = eraseAccount('alice', 'alice@example.com', 'secret');
    await reached;
    const staleRestore = restoreExport('alice', archive);
    release();
    expect(await erase).toBe(true);
    await expect(staleRestore).rejects.toThrow('RESTORE_FORBIDDEN');
    expect(db.rows(erasureTombstones)).toMatchObject([{ userId: 'alice' }]);
    expect(db.rows(users)).toEqual([]);
  });

  it('holds a coherent read snapshot under mutation and releases on cancellation without prefetching owned rows', async () => {
    db.seed(users, { id: 'alice', email: 'alice@example.com', passwordHash: 'hash' });
    seed(db, populated('alice'));
    const reader = exportStream('alice').getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('schemaVersion');
    expect(db.events).toEqual(['read-only']);
    db.seed(portfolios, make(portfolios, 'new', { userId: 'alice', name: 'Later' }));
    const chunks: Uint8Array[] = [];
    while (true) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); }
    const tail = new TextDecoder().decode(await new Response(new Blob(chunks)).arrayBuffer());
    expect(tail).not.toContain('Later');
    expect(db.rows(portfolios).map((r) => r.id)).toContain('new');
    expect(db.events).toContain('commit');
    const second = exportStream('alice').getReader();
    await second.read();
    await second.cancel();
    expect(db.events.at(-1)).toBe('rollback');
  });
});
