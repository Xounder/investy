import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { accounts, assets, brokers, holdings, portfolioSnapshots, portfolios, transactions } from '../src/db/schema.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder, findSession, cached, overrides } = vi.hoisted(() => ({
  holder: { db: null as unknown }, findSession: vi.fn(), cached: vi.fn(), overrides: vi.fn(),
}));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));
vi.mock('../src/services/market-data/cache.js', () => ({ getCachedQuotes: cached }));
vi.mock('../src/services/market-data/overrides.js', () => ({ getUserOverridesByAssetIds: overrides }));

type Row = Record<string, unknown>;
const rows = new Map<unknown, Row[]>();
const predicates: Array<{ table: unknown; columns: string[]; values: unknown[] }> = [];
const fieldName = (column: string) => column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

class Query {
  private table: unknown;
  private condition: { columns: string[]; values: unknown[] } = { columns: [], values: [] };
  private payload: Row = {};
  private joined = false;
  private max: number | undefined;
  constructor(private mode: 'select' | 'insert' | 'update' | 'delete', table?: unknown) { this.table = table; }
  from(table: unknown) { this.table = table; return this; }
  where(sql: unknown) {
    this.condition = whereFacts(sql);
    predicates.push({ table: this.table, ...this.condition });
    return this;
  }
  innerJoin() { this.joined = true; return this; }
  orderBy() { return this; }
  limit(max: number) { this.max = max; return this; }
  values(payload: Row) { this.payload = payload; return this; }
  set(payload: Row) { this.payload = payload; return this; }
  returning() { return Promise.resolve(this.run()); }
  then<T>(resolve: (value: Row[]) => T, reject?: (error: unknown) => unknown) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject);
  }
  private matching() {
    return (rows.get(this.table) ?? []).filter((row) => this.condition.columns.every((column, index) => {
      const field = fieldName(column);
      const value = field === 'portfolioId' && this.table === holdings
        ? (rows.get(accounts) ?? []).find((account) => account.id === row.accountId)?.portfolioId : row[field];
      const expected = this.condition.values[index];
      if (field === 'date' && this.table === portfolioSnapshots && expected instanceof Date && value instanceof Date) {
        return value >= expected;
      }
      return value === expected;
    }));
  }
  private run(): Row[] {
    if (this.mode === 'insert') {
      const row = { createdAt: new Date(), ...this.payload };
      rows.set(this.table, [...(rows.get(this.table) ?? []), row]);
      return [row];
    }
    const matches = this.matching();
    if (this.mode === 'update') { matches.forEach((row) => Object.assign(row, this.payload)); return matches; }
    if (this.mode === 'delete') {
      rows.set(this.table, (rows.get(this.table) ?? []).filter((row) => !matches.includes(row)));
      return matches;
    }
    const selected = matches.slice(0, this.max);
    if (this.joined && this.table === holdings) return selected.map((holding) => ({
      holding, asset: (rows.get(assets) ?? []).find((asset) => asset.id === holding.assetId),
    }));
    return selected;
  }
  deleted() { const count = this.run().length; return Promise.resolve({ rowCount: count }); }
}

const db = {
  select: () => new Query('select'),
  insert: (table: unknown) => new Query('insert', table),
  update: (table: unknown) => new Query('update', table),
  delete: (table: unknown) => ({ where: (condition: unknown) => new Query('delete', table).where(condition).deleted() }),
};
holder.db = db;

function request(user: string, path: string, method = 'GET', body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: { Cookie: `session=${createSessionToken(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  rows.clear(); predicates.length = 0;
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  cached.mockResolvedValue([]); overrides.mockResolvedValue([]);
  rows.set(portfolios, []); rows.set(accounts, []); rows.set(brokers, []);
  rows.set(holdings, []); rows.set(transactions, []); rows.set(portfolioSnapshots, []);
});

describe('TASK-05 production portfolio structure and snapshot flows', () => {
  it('creates, lists, details, updates and deletes a portfolio, with owner isolation', async () => {
    const created = await request('alice', '/portfolios', 'POST', { name: 'Long term', isDefault: true });
    expect(created.status).toBe(201);
    const portfolio = await created.json() as { id: string; name: string };
    expect(portfolio.name).toBe('Long term');
    expect(await (await request('alice', '/portfolios')).json()).toMatchObject({ portfolios: [{ id: portfolio.id }] });
    expect(await (await request('alice', `/portfolios/${portfolio.id}`)).json()).toMatchObject({
      summary: { accountsCount: 0, holdingsCount: 0, totalCostBasisCents: '0', realizedPnlCents: '0' },
    });
    expect((await request('bob', `/portfolios/${portfolio.id}`)).status).toBe(404);
    expect((await request('bob', `/portfolios/${portfolio.id}`, 'PATCH', { name: 'Stolen' })).status).toBe(404);
    expect((await request('bob', `/portfolios/${portfolio.id}`, 'DELETE')).status).toBe(404);
    expect(await (await request('alice', `/portfolios/${portfolio.id}`, 'PATCH', { name: 'Retirement' })).json())
      .toMatchObject({ name: 'Retirement', userId: 'alice' });
    expect(rows.get(portfolios)?.[0]?.name).toBe('Retirement');
    expect((await request('alice', `/portfolios/${portfolio.id}`, 'DELETE')).status).toBe(204);
    expect(await (await request('alice', '/portfolios')).json()).toEqual({ portfolios: [] });
    expect(predicates.filter((p) => p.table === portfolios && p.columns.includes('id'))
      .every((p) => p.values.includes('alice') || p.values.includes('bob'))).toBe(true);
  });

  it('seeds catalog, creates a custom broker, and enforces account CRUD and ownership guards', async () => {
    const catalog = await request('alice', '/brokers');
    expect(catalog.status).toBe(200);
    expect(await catalog.json()).toEqual({ brokers: expect.arrayContaining([expect.objectContaining({ code: 'xp', isSeeded: true })]) });
    const custom = await request('alice', '/brokers', 'POST', { name: 'Independent', code: 'independent' });
    expect(custom.status).toBe(201);
    const broker = await custom.json() as { id: string };
    expect((await request('alice', '/brokers', 'POST', { name: 'Duplicate', code: 'independent' })).status).toBe(409);
    const portfolio = await (await request('alice', '/portfolios', 'POST', { name: 'Main' })).json() as { id: string };
    const path = `/accounts?portfolioId=${portfolio.id}`;
    expect((await request('bob', path)).status).toBe(404);
    expect((await request('bob', '/accounts', 'POST', { portfolioId: portfolio.id, brokerId: broker.id, name: 'Other' })).status).toBe(404);
    expect((await request('alice', '/accounts', 'POST', { portfolioId: portfolio.id, brokerId: 'missing', name: 'Bad' })).status).toBe(400);
    const created = await request('alice', '/accounts', 'POST', { portfolioId: portfolio.id, brokerId: broker.id, name: 'Trading' });
    expect(created.status).toBe(201);
    const account = await created.json() as { id: string };
    expect(await (await request('alice', path)).json()).toMatchObject({ accounts: [{ id: account.id, brokerId: broker.id }] });
    expect((await request('bob', `/accounts/${account.id}`, 'PATCH', { name: 'Other' })).status).toBe(404);
    expect((await request('bob', `/accounts/${account.id}`, 'DELETE')).status).toBe(404);
    expect(await (await request('alice', `/accounts/${account.id}`, 'PATCH', { name: 'Renamed' })).json())
      .toMatchObject({ name: 'Renamed', userId: 'alice' });
    rows.get(transactions)?.push({ id: 'trade', userId: 'alice', accountId: account.id, portfolioId: portfolio.id });
    expect((await request('alice', `/accounts/${account.id}`, 'DELETE')).status).toBe(409);
    expect((await request('alice', `/portfolios/${portfolio.id}`, 'DELETE')).status).toBe(409);
    rows.set(transactions, []);
    expect((await request('alice', `/accounts/${account.id}`, 'DELETE')).status).toBe(204);
    expect(await (await request('alice', path)).json()).toEqual({ accounts: [] });
    expect((await request('alice', `/portfolios/${portfolio.id}`, 'DELETE')).status).toBe(204);
  });

  it('computes populated portfolio detail, summary and allocation from real valuation and filters owned snapshots by range', async () => {
    const portfolio = await (await request('alice', '/portfolios', 'POST', { name: 'Investments' })).json() as { id: string };
    rows.get(accounts)?.push({ id: 'a1', userId: 'alice', portfolioId: portfolio.id });
    rows.set(assets, [
      { id: 'pet', class: 'acao', sector: 'Energy', currency: 'BRL' },
      { id: 'fii', class: 'fii', sector: 'Real Estate', currency: 'BRL' },
    ]);
    rows.get(holdings)?.push(
      { id: 'h1', userId: 'alice', accountId: 'a1', assetId: 'pet', qty: 2n, costBasisCents: 1000n, realizedPnlCents: 100n },
      { id: 'h2', userId: 'alice', accountId: 'a1', assetId: 'fii', qty: 1n, costBasisCents: 1000n, realizedPnlCents: 0n },
    );
    cached.mockResolvedValue([
      { quote: { assetId: 'pet', priceCents: 1000n, currency: 'BRL' }, isStale: false, isExpired: false },
      { quote: { assetId: 'fii', priceCents: 1000n, currency: 'BRL' }, isStale: false, isExpired: false },
    ]);
    expect(await (await request('alice', `/portfolios/${portfolio.id}`)).json()).toMatchObject({
      summary: { accountsCount: 1, holdingsCount: 2, totalCostBasisCents: '2000', realizedPnlCents: '100' },
    });
    expect((await request('alice', `/portfolios/${portfolio.id}`, 'DELETE')).status).toBe(409);
    expect(rows.get(portfolios)).toHaveLength(1);
    const summaryPath = `/portfolio/summary?portfolioId=${portfolio.id}`;
    expect(await (await request('alice', summaryPath)).json()).toMatchObject({
      totalMarketValueCents: '3000', totalCostBasisCents: '2000', unrealizedPnlCents: '1000',
      realizedPnlCents: '100', currency: 'BRL', allocation: { byClass: expect.arrayContaining([
        { key: 'acao', valueCents: '2000', percent: 66.66 }, { key: 'fii', valueCents: '1000', percent: 33.33 },
      ]) },
    });
    expect(await (await request('alice', `/portfolio/allocation?portfolioId=${portfolio.id}`)).json())
      .toMatchObject({ bySector: expect.arrayContaining([{ key: 'Energy', valueCents: '2000', percent: 66.66 }]) });
    const old = new Date(Date.now() - 100 * 86400_000);
    const recent = new Date(Date.now() - 2 * 86400_000);
    rows.get(portfolioSnapshots)?.push(
      { id: 'old', userId: 'alice', portfolioId: portfolio.id, date: old, totalValueCents: 2000n, costBasisCents: 1800n },
      { id: 'new', userId: 'alice', portfolioId: portfolio.id, date: recent, totalValueCents: 3000n, costBasisCents: 2000n },
      { id: 'foreign', userId: 'bob', portfolioId: portfolio.id, date: recent, totalValueCents: 9999n, costBasisCents: 1n },
    );
    const snapshotPath = `/portfolio/snapshots?portfolioId=${portfolio.id}`;
    expect(await (await request('alice', `${snapshotPath}&range=1m`)).json())
      .toMatchObject({ snapshots: [{ id: 'new', totalValueCents: '3000' }] });
    expect(await (await request('alice', `${snapshotPath}&range=all`)).json())
      .toMatchObject({ snapshots: [{ id: 'old' }, { id: 'new' }] });
    expect((await request('bob', summaryPath)).status).toBe(404);
    expect((await request('bob', `${snapshotPath}&range=all`)).status).toBe(404);
    expect(predicates.filter((p) => p.table === portfolioSnapshots).every((p) =>
      p.columns.includes('user_id') && p.columns.includes('portfolio_id'))).toBe(true);
  });
});
