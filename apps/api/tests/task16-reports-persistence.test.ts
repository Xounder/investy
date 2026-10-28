import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readIncome, readPerformance } from '../src/repositories/reports.js';
import { assets, benchmarkSeries, dividends, portfolioSnapshots, portfolios, transactions } from '../src/db/schema.js';
import { whereFacts } from './helpers/sql-facts.js';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../src/db/client.js', () => ({ getDb: () => state.db }));
type Row = Record<string, unknown>;
const tables = new Map<unknown, Row[]>();
const captures: Array<{ table: unknown; columns: string[]; values: unknown[]; limit: number; offset: number }> = [];
let isolation: unknown;
class Query {
  private table: unknown;
  private columns: string[] = [];
  private values: unknown[] = [];
  private max = Infinity;
  private skip = 0;
  constructor(private readonly selection?: Record<string, unknown>) {}
  from(table: unknown) { this.table = table; return this; }
  where(sql: unknown) { const facts = whereFacts(sql); this.columns = facts.columns; this.values = facts.values; return this; }
  orderBy() { return this; }
  limit(n: number) { this.max = n; return this; }
  offset(n: number) { this.skip = n; return this; }
  then<T>(resolve: (rows: Row[]) => T, reject?: (error: unknown) => unknown) {
    try {
      captures.push({ table: this.table, columns: this.columns, values: this.values, limit: this.max, offset: this.skip });
      const rows = (tables.get(this.table) ?? []).filter(row => {
        if (this.table === portfolios) return row.id === this.values[0] && row.userId === this.values[1];
        if (this.table === assets) return this.values.includes(row.id);
        if (this.table === benchmarkSeries && !this.values.includes(row.symbol)) return false;
        if (this.table !== benchmarkSeries && (row.userId !== this.values[0] || row.portfolioId !== this.values[1])) return false;
        if (this.table === dividends && row.status !== 'paid') return false;
        if (this.table === transactions) {
          if (this.columns.includes('dividend_id')) {
            if (!this.values.slice(2).includes(row.dividendId)) return false;
          } else if (row.type !== 'sell') return false;
        }
        const bounds = this.values.filter(value => value instanceof Date) as Date[];
        const date = (this.table === dividends ? row.paymentDate : row.date) as Date | undefined;
        if (bounds.length === 1) return !!date && date < bounds[0]!;
        if (bounds.length === 2) return !!date && date >= bounds[0]! && date < bounds[1]!;
        return true;
      }).slice(this.skip, this.skip + this.max);
      return Promise.resolve(this.selection ? rows.map(row => Object.fromEntries(Object.keys(this.selection!).map(key => [key, row[key]]))) : rows).then(resolve, reject);
    } catch (error) { return Promise.reject(error).then(resolve, reject); }
  }
}
interface FakeDb { select: (selection?: Record<string, unknown>) => Query;
  transaction: <T>(fn: (tx: FakeDb) => Promise<T>, config: unknown) => Promise<T> }
const db: FakeDb = { select: (selection?: Record<string, unknown>) => new Query(selection),
  transaction: async <T>(fn: (tx: FakeDb) => Promise<T>, config: unknown) => { isolation = config; return fn(db); } };
state.db = db;
const portfolioId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => {
  tables.clear(); captures.length = 0; isolation = null;
  tables.set(portfolios, [{ id: portfolioId, userId: 'alice' }]);
  tables.set(benchmarkSeries, []); tables.set(dividends, []); tables.set(transactions, []); tables.set(assets, []);
});

describe('report persistence boundary', () => {
  it('requires owner inside the transaction, reads every snapshot page, and never reports a first-page-only history', async () => {
    tables.set(portfolioSnapshots, Array.from({ length: 1001 }, (_, index) => ({ id: String(index),
      userId: 'alice', portfolioId, date: new Date(Date.UTC(2020, 0, 1 + index)), totalValueCents: 100n })));
    const start = new Date('2020-01-01');
    const end = new Date('2023-01-01');
    expect(await readPerformance('bob', portfolioId, start, end)).toBeNull();
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ values: [portfolioId, 'bob'] });
    captures.length = 0;
    const result = await readPerformance('alice', portfolioId, start, end);
    expect(result?.snapshots).toHaveLength(1001);
    expect(captures.filter(c => c.table === portfolioSnapshots && c.columns.filter(v => v === 'date').length === 2)
      .map(c => [c.offset, c.limit]))
      .toEqual([[0, 500], [500, 500], [1000, 500]]);
    expect(captures.filter(c => c.table === portfolioSnapshots).every(c =>
      c.values.includes('alice') && c.values.includes(portfolioId))).toBe(true);
    expect(isolation).toEqual({ isolationLevel: 'repeatable read' });
  });

  it('scopes each income and linked-receipt page to user and portfolio with exclusive end bounds', async () => {
    tables.set(dividends, Array.from({ length: 501 }, (_, index) => ({ id: String(index), userId: 'alice',
      portfolioId, status: 'paid', assetId: 'asset', paymentDate: new Date('2026-01-01') })));
    tables.set(transactions, Array.from({ length: 501 }, (_, index) => ({ id: String(index), userId: 'alice',
      portfolioId, type: 'sell', dividendId: String(index), date: new Date('2026-01-01'), assetId: 'asset',
      realizedPnlCents: 1n })));
    const result = await readIncome('alice', portfolioId, new Date('2026-01-01'), new Date('2026-02-01'),
      '2026-01-01', '2026-01-31');
    expect(result?.excludedReceiptCount).toBe(501);
    expect(result?.totals.realizedSalePnlCents).toBe('501');
    const owned = captures.filter(c => c.table === dividends || c.table === transactions);
    expect(owned.every(c => c.values.includes('alice') && c.values.includes(portfolioId) && c.limit === 500)).toBe(true);
    expect(owned.filter(c => c.table === dividends).map(c => c.offset)).toEqual([0, 500]);
    expect(owned.filter(c => c.table === dividends)[0]?.values).toContainEqual(new Date('2026-02-01'));
    expect(captures.filter(c => c.table === transactions && c.columns.includes('dividend_id'))).toHaveLength(3);
    captures.length = 0;
    expect(await readIncome('bob', portfolioId, new Date('2026-01-01'), new Date('2026-02-01'),
      '2026-01-01', '2026-01-31')).toBeNull();
    expect(captures).toHaveLength(1);
  });

  it('actually excludes outside-window rows while including both calendar endpoints and never mixing owners', async () => {
    const start = new Date('2026-01-01');
    const end = new Date('2026-02-01');
    const days = ['2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z',
      '2026-01-31T23:59:59Z', '2026-02-01T00:00:00Z'];
    tables.set(portfolioSnapshots, days.map((date, i) => ({ id: `snap${i}`, userId: 'alice',
      portfolioId, date: new Date(date), totalValueCents: 100n })));
    tables.get(portfolioSnapshots)!.push({ id: 'foreign', userId: 'bob', portfolioId,
      date: new Date(days[1]!), totalValueCents: 999n });
    tables.set(benchmarkSeries, days.map((date, i) => ({ id: `yahoo-index:IBOV:${i}`, symbol: 'IBOV',
      date: new Date(date), value: 100n })));
    const performance = await readPerformance('alice', portfolioId, start, end);
    expect(performance?.snapshots.map(row => row.id)).toEqual(['snap1', 'snap2']);
    expect(performance?.benchmarks).toHaveLength(2);
    expect(performance?.historyBeforeWindow).toBe(true);
    tables.set(dividends, days.map((date, i) => ({ id: `div${i}`, userId: 'alice', portfolioId,
      assetId: 'asset', kind: 'dividend', status: 'paid', paymentDate: new Date(date) })));
    tables.get(dividends)!.push({ id: 'foreign', userId: 'bob', portfolioId,
      assetId: 'asset', kind: 'dividend', status: 'paid', paymentDate: new Date(days[1]!) });
    tables.set(transactions, [
      ...days.map((date, i) => ({ id: `sale${i}`, userId: 'alice', portfolioId,
        assetId: 'asset', date: new Date(date), type: 'sell', realizedPnlCents: 1n })),
      { id: 'foreign-sale', userId: 'bob', portfolioId, assetId: 'asset', date: new Date(days[1]!),
        type: 'sell', realizedPnlCents: 999n },
      { id: 'receipt1', userId: 'alice', portfolioId, assetId: 'asset', type: 'dividend',
        dividendId: 'div1', date: new Date(days[1]!), qty: 1n, unitPriceCents: 1n, currency: 'BRL', fxRateToBRL: null },
      { id: 'receipt2', userId: 'alice', portfolioId, assetId: 'asset', type: 'dividend',
        dividendId: 'div2', date: new Date(days[2]!), qty: 1n, unitPriceCents: 2n, currency: 'BRL', fxRateToBRL: null },
    ]);
    tables.set(assets, [{ id: 'asset', symbol: 'A', class: 'fii' }]);
    const income = await readIncome('alice', portfolioId, start, end, '2026-01-01', '2026-01-31');
    expect(income?.totals).toEqual({ incomeCents: '3', amortizationCents: '0', realizedSalePnlCents: '2' });
    expect(income?.excludedReceiptCount).toBe(0);
    expect(income?.byAsset[0]).toMatchObject({ assetId: 'asset', incomeCents: '3', realizedSalePnlCents: '2' });
  });

  it('rejects excessive snapshot density rather than implying a complete capped series', async () => {
    tables.set(portfolioSnapshots, Array.from({ length: 5001 }, (_, index) => ({ id: String(index),
      userId: 'alice', portfolioId, date: new Date(Date.UTC(2026, 0, 1, 0, 0, index)) })));
    await expect(readPerformance('alice', portfolioId, new Date('2026-01-01'), new Date('2026-02-01')))
      .rejects.toThrow('Snapshot window exceeds supported observation density');
    expect(captures.filter(c => c.table === portfolioSnapshots && c.columns.filter(v => v === 'date').length === 2)
      .every(c => c.limit === 500 && c.values.includes(portfolioId))).toBe(true);
  });
});
