import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { accounts, assets, holdings, portfolios, transactions } from '../src/db/schema.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder, findSession, cached, overrides, fx } = vi.hoisted(() => ({
  holder: { db: null as unknown }, findSession: vi.fn(), cached: vi.fn(), overrides: vi.fn(), fx: vi.fn(),
}));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));
vi.mock('../src/services/market-data/cache.js', () => ({ getCachedQuotes: cached }));
vi.mock('../src/services/market-data/overrides.js', () => ({ getUserOverridesByAssetIds: overrides }));
vi.mock('../src/services/market-data/fx.js', () => ({ getFxRate: fx }));

type Row = Record<string, unknown>;
const rows = new Map<unknown, Row[]>();
const captures: Array<{ table: unknown; columns: string[]; values: unknown[] }> = [];
let failRecompute = false;

class Query {
  private table: unknown;
  private predicate: { columns: string[]; values: unknown[] } = { columns: [], values: [] };
  private payload: Row = {};
  private max: number | undefined;
  private skip = 0;
  private joined = false;
  private ordered = false;
  constructor(private mode: 'select' | 'insert' | 'update' | 'delete', table?: unknown) { this.table = table; }
  from(table: unknown) { this.table = table; return this; }
  where(condition: unknown) {
    this.predicate = whereFacts(condition);
    captures.push({ table: this.table, ...this.predicate });
    return this;
  }
  innerJoin() { this.joined = true; return this; }
  orderBy() { this.ordered = true; return this; }
  limit(count: number) { this.max = count; return this; }
  offset(count: number) { this.skip = count; return this; }
  values(value: Row) { this.payload = value; return this; }
  set(value: Row) { this.payload = value; return this; }
  returning() { return Promise.resolve(this.run()); }
  then<T>(resolve: (value: Row[]) => T, reject?: (error: unknown) => unknown) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject);
  }
  private matching(): Row[] {
    return (rows.get(this.table) ?? []).filter((row) =>
      this.predicate.columns.every((column, index) => {
        const field = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
        const value = field === 'portfolioId' && this.table === holdings
          ? (rows.get(accounts) ?? []).find((a) => a.id === row.accountId)?.portfolioId
          : row[field];
        return value instanceof Date && this.predicate.values[index] instanceof Date
          ? value.getTime() === (this.predicate.values[index] as Date).getTime()
          : value === this.predicate.values[index];
      }),
    );
  }
  private run(): Row[] {
    if (this.table === holdings && failRecompute && this.mode !== 'select') throw new Error('recompute failed');
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
    const ordered = this.ordered && this.table === transactions
      ? [...matches].sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()) : matches;
    const selected = ordered.slice(this.skip, this.max === undefined ? undefined : this.skip + this.max);
    if (this.joined && this.table === holdings) return selected.map((holding) => ({
      holding, asset: (rows.get(assets) ?? []).find((asset) => asset.id === holding.assetId),
    }));
    return selected;
  }
}

interface DbDouble {
  select: () => Query;
  insert: (table: unknown) => Query;
  update: (table: unknown) => Query;
  delete: (table: unknown) => Query;
  execute: () => Promise<undefined>;
  transaction: <T>(fn: (tx: DbDouble) => Promise<T>) => Promise<T>;
}
const db: DbDouble = {
  select: () => new Query('select'), insert: (table: unknown) => new Query('insert', table),
  update: (table: unknown) => new Query('update', table), delete: (table: unknown) => new Query('delete', table),
  execute: async () => undefined,
  transaction: async <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> => {
    const snapshot = new Map([...rows].map(([table, data]) => [table, data.map((row) => ({ ...row }))]));
    try { return await fn(db); } catch (error) {
      rows.clear(); for (const [table, data] of snapshot) rows.set(table, data);
      throw error;
    }
  },
};
holder.db = db;

function request(user: string, path: string, method = 'GET', body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method, headers: { Cookie: `session=${createSessionToken(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const purchase = { accountId: '00000000-0000-4000-8000-000000000001', assetId: '00000000-0000-4000-8000-000000000003', type: 'buy', date: '2025-01-01', qty: 3, unitPriceCents: 1000 };
beforeEach(() => {
  rows.clear(); captures.length = 0; failRecompute = false;
  rows.set(accounts, [{ id: '00000000-0000-4000-8000-000000000001', userId: 'alice', portfolioId: '00000000-0000-4000-8000-000000000002' }]);
  rows.set(portfolios, [{ id: '00000000-0000-4000-8000-000000000002', userId: 'alice' }]);
  rows.set(assets, [{ id: '00000000-0000-4000-8000-000000000003', symbol: 'PETR4', name: 'Petrobras', class: 'acao', sector: 'Oil', currency: 'BRL' }]);
  rows.set(transactions, []); rows.set(holdings, []);
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  cached.mockResolvedValue([{ quote: { assetId: '00000000-0000-4000-8000-000000000003', priceCents: 1500n, currency: 'BRL' }, isStale: true, isExpired: false }]);
  overrides.mockResolvedValue([]);
  fx.mockResolvedValue(null);
});

describe('production app journal to valued holdings', () => {
  it('creates, reads, updates and deletes a journal event with materialized position', async () => {
    const created = await request('alice', '/transactions', 'POST', purchase);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const listed = await request('alice', '/holdings?portfolioId=00000000-0000-4000-8000-000000000002&accountId=00000000-0000-4000-8000-000000000001');
    expect(await listed.json()).toMatchObject({ holdings: [{ qty: '3', costBasisCents: '3000', marketValueCentsBRL: '4500', isStale: true }] });
    const detail = await request('alice', '/holdings/00000000-0000-4000-8000-000000000003');
    expect(await detail.json()).toMatchObject({ summary: { qty: '3', marketValueCentsBRL: '4500' }, events: [{ id }] });
    expect((await request('bob', `/transactions/${id}`, 'DELETE')).status).toBe(404);
    expect(rows.get(transactions)).toHaveLength(1);
    expect((await request('alice', `/transactions/${id}`, 'PATCH', { qty: 2 })).status).toBe(200);
    expect(rows.get(holdings)?.[0]).toMatchObject({ qty: 2n, costBasisCents: 2000n });
    expect((await request('alice', `/transactions/${id}`, 'DELETE')).status).toBe(204);
    expect(rows.get(transactions)).toHaveLength(0);
    expect(rows.get(holdings)).toHaveLength(0);
    expect(captures.filter((c) => c.table === transactions).every((c) => c.values.includes('alice') || c.values.includes('bob'))).toBe(true);
  });

  it('rolls back a failed holding recompute and rejects foreign accounts and unknown assets', async () => {
    failRecompute = true;
    expect((await request('alice', '/transactions', 'POST', purchase)).status).toBe(500);
    expect(rows.get(transactions)).toHaveLength(0);
    failRecompute = false;
    expect((await request('bob', '/transactions', 'POST', purchase)).status).toBe(404);
    expect((await request('alice', '/transactions', 'POST', { ...purchase, assetId: '00000000-0000-4000-8000-000000000006' })).status).toBe(400);
    expect(rows.get(transactions)).toHaveLength(0);
  });

  it('pins USD acquisition FX, returns sale P&L and replays edited/backdated and deleted entries', async () => {
    rows.set(assets, [{ id: purchase.assetId, symbol: 'VTI', name: 'VTI', class: 'etf_us', currency: 'USD' }]);
    cached.mockResolvedValue([{ quote: { assetId: purchase.assetId, priceCents: 15000n, currency: 'USD' }, isStale: false, isExpired: false }]);
    fx.mockResolvedValue({ rate: 6, fetchedAt: new Date() });
    const missing = await request('alice', '/transactions', 'POST', { ...purchase, unitPriceCents: 10000 });
    expect(missing.status).toBe(400);
    expect(rows.get(transactions)).toHaveLength(0);
    expect((await request('alice', '/transactions', 'POST', { ...purchase, unitPriceCents: 10000, fxRateToBRL: 0 })).status).toBe(400);
    const buy = await request('alice', '/transactions', 'POST', { ...purchase, qty: 10, unitPriceCents: 10000, feeCents: 100, fxRateToBRL: 5000000 });
    expect(buy.status).toBe(201);
    expect(await buy.json()).toMatchObject({ currency: 'USD', unitPriceCents: '10000', fxRateToBRL: '5000000' });
    const sell = await request('alice', '/transactions', 'POST', { ...purchase, type: 'sell', date: '2025-02-01', qty: 4, unitPriceCents: 12000, feeCents: 200, fxRateToBRL: 5500000 });
    expect(sell.status).toBe(201);
    const sale = await sell.json() as { id: string; realizedPnlCents: string };
    // 4 × $120 × 5.50 − $2 × 5.50 − 4/10 × ($1000 × 5 + $1 × 5).
    expect(sale.realizedPnlCents).toBe('62700');
    expect(rows.get(holdings)?.[0]).toMatchObject({ qty: 6n, costBasisCents: 300300n, realizedPnlCents: 62700n });
    const valued = await request('alice', '/portfolio/summary?portfolioId=00000000-0000-4000-8000-000000000002');
    expect(await valued.json()).toMatchObject({ totalCostBasisCents: '300300', totalMarketValueCents: '540000', unrealizedPnlCents: '239700', realizedPnlCents: '62700' });
    const earlier = await request('alice', '/transactions', 'POST', { ...purchase, date: '2024-12-01', qty: 10, unitPriceCents: 8000, fxRateToBRL: 4000000 });
    expect(earlier.status).toBe(201);
    expect(rows.get(transactions)?.find((row) => row.id === sale.id)?.realizedPnlCents).toBe(98800n);
    const changed = await request('alice', `/transactions/${sale.id}`, 'PATCH', { unitPriceCents: 10000 });
    expect(await changed.json()).toMatchObject({ realizedPnlCents: '54800' });
    const reFx = await request('alice', `/transactions/${sale.id}`, 'PATCH', { fxRateToBRL: 6000000 });
    expect(await reFx.json()).toMatchObject({ currency: 'USD', fxRateToBRL: '6000000', realizedPnlCents: '74700' });
    const earlierId = (await earlier.json() as { id: string }).id;
    expect((await request('alice', `/transactions/${earlierId}`, 'DELETE')).status).toBe(204);
    expect(rows.get(transactions)?.find((row) => row.id === sale.id)?.realizedPnlCents).toBe(38600n);
    const listed = await request('alice', '/transactions?type=sell');
    expect(await listed.json()).toMatchObject({ items: [{ id: sale.id, realizedPnlCents: '38600' }] });
  });
});
