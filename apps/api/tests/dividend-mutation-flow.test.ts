import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { accounts, assets, holdings, transactions } from '../src/db/schema.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder, findSession } = vi.hoisted(() => ({ holder: { db: null as unknown }, findSession: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));

type Row = Record<string, unknown>;
const rows = new Map<unknown, Row[]>();
let commits = 0;
class Query {
  private table: unknown;
  private predicate: { columns: string[]; values: unknown[] } = { columns: [], values: [] };
  private payload: Row = {};
  private max = Infinity;
  private sorted = false;
  constructor(private mode: 'select' | 'insert' | 'update' | 'delete', table?: unknown) { this.table = table; }
  from(table: unknown) { this.table = table; return this; }
  where(condition: unknown) { this.predicate = whereFacts(condition); return this; }
  orderBy() { this.sorted = true; return this; }
  limit(max: number) { this.max = max; return this; }
  values(payload: Row) { this.payload = payload; return this; }
  set(payload: Row) { this.payload = payload; return this; }
  returning() { return Promise.resolve(this.run()); }
  then<T>(resolve: (value: Row[]) => T, reject?: (reason: unknown) => unknown) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject);
  }
  private run(): Row[] {
    const matches = (rows.get(this.table) ?? []).filter((row) => this.predicate.columns.every((column, index) => {
      const actual = row[column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())];
      const expected = this.predicate.values[index];
      if (Array.isArray(expected)) return expected.includes(actual);
      return actual === expected;
    }));
    if (this.mode === 'insert') {
      const row = { createdAt: new Date(), ...this.payload };
      rows.set(this.table, [...(rows.get(this.table) ?? []), row]);
      return [row];
    }
    if (this.mode === 'update') { matches.forEach((row) => Object.assign(row, this.payload)); return matches; }
    if (this.mode === 'delete') {
      rows.set(this.table, (rows.get(this.table) ?? []).filter((row) => !matches.includes(row)));
      return matches;
    }
    const sorted = this.sorted && this.table === transactions ? [...matches].sort((a, b) =>
      (a.date as Date).getTime() - (b.date as Date).getTime()) : matches;
    return sorted.slice(0, this.max);
  }
}
interface DbDouble {
  select: () => Query;
  insert: (table: unknown) => Query;
  update: (table: unknown) => Query;
  delete: (table: unknown) => Query;
  execute: () => Promise<void>;
  transaction: <T>(fn: (tx: DbDouble) => Promise<T>) => Promise<T>;
}
const db: DbDouble = {
  select: () => new Query('select'), insert: (table) => new Query('insert', table),
  update: (table) => new Query('update', table), delete: (table) => new Query('delete', table),
  execute: async () => undefined,
  transaction: async <T>(fn: (tx: DbDouble) => Promise<T>): Promise<T> => {
    const snapshot = new Map([...rows].map(([table, data]) => [table, data.map((row) => ({ ...row }))]));
    try { const result = await fn(db); commits++; return result; }
    catch (error) { rows.clear(); for (const [table, data] of snapshot) rows.set(table, data); throw error; }
  },
};
holder.db = db;

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const portfolioId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const trade = { accountId, assetId, type: 'dividend', date: '2026-01-02', qty: 3, unitPriceCents: 1, fxRateToBRL: 1_500_000 };
function request(path: string, method: string, body?: object | FormData) {
  return app.request(`/api/v1${path}`, { method,
    headers: { Cookie: `session=${createSessionToken('alice')}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
}
function upload(text: string) {
  const form = new FormData();
  form.set('file', new File([text], 'income.csv', { type: 'text/csv' }));
  return form;
}
beforeEach(() => {
  commits = 0; rows.clear();
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  rows.set(accounts, [{ id: accountId, userId: 'alice', portfolioId, name: 'Investimentos' }]);
  rows.set(assets, [{ id: assetId, symbol: 'VTI', currency: 'USD' }]);
  rows.set(transactions, []); rows.set(holdings, []);
});

describe('real dividend write and journal recompute (DB boundary double)', () => {
  it('rounds once on the aggregate, replays backdated/edited dividends and preserves the position basis', async () => {
    const buy = await request('/transactions', 'POST', { ...trade, type: 'buy', date: '2026-01-01', unitPriceCents: 100, fxRateToBRL: 1_000_000 });
    expect(buy.status).toBe(201);
    const dividend = await request('/transactions', 'POST', trade);
    expect(dividend.status).toBe(201);
    const { id } = await dividend.json() as { id: string };
    expect(rows.get(transactions)?.[1]).toMatchObject({ type: 'dividend', qty: 3n, unitPriceCents: 1n, fxRateToBRL: 1_500_000n });
    expect(rows.get(holdings)?.[0]).toMatchObject({ qty: 3n, costBasisCents: 300n, realizedPnlCents: 5n });
    const changed = await request(`/transactions/${id}`, 'PATCH', { fxRateToBRL: 100_000 });
    expect(changed.status).toBe(200);
    expect(rows.get(holdings)?.[0]).toMatchObject({ qty: 3n, costBasisCents: 300n, realizedPnlCents: 0n });
    expect((await request(`/transactions/${id}`, 'DELETE')).status).toBe(204);
    expect(rows.get(holdings)?.[0]).toMatchObject({ qty: 3n, costBasisCents: 300n, realizedPnlCents: 0n });
  });

  it('rejects nonzero fee and zero price on mutation, rolling back the journal and holding', async () => {
    for (const input of [{ ...trade, feeCents: 1, fxRateToBRL: 100_000 }, { ...trade, unitPriceCents: 0 }]) {
      const response = await request('/transactions', 'POST', input);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'JOURNAL' } });
    }
    expect(rows.get(transactions)).toHaveLength(0);
    expect(rows.get(holdings)).toHaveLength(0);
    expect(commits).toBe(0);
  });

  it('imports CSV dividend through the real batch write and recomputes fractional FX once', async () => {
    const csv = 'type,date,account,symbol,qty,unitPriceCents,feeCents,fxRateToBRL\n'
      + 'buy,2026-01-01,Investimentos,VTI,3,100,0,1000000\n'
      + 'dividend,2026-01-02,Investimentos,VTI,3,1,0,1500000';
    const response = await request('/transactions/import/csv', 'POST', upload(csv));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: 2, errors: [] });
    expect(commits).toBe(1);
    expect(rows.get(transactions)?.map((row) => row.type)).toEqual(['buy', 'dividend']);
    expect(rows.get(holdings)?.[0]).toMatchObject({ qty: 3n, costBasisCents: 300n, realizedPnlCents: 5n });
  });
});
