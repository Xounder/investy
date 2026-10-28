import { beforeEach, expect, it, vi } from 'vitest';
import { accounts, assets, holdings, transactions } from '../src/db/schema.js';
import { appendJournalEvent, repairHistoricalFx, JournalServiceError } from '../src/services/journal.js';

const { state } = vi.hoisted(() => ({ state: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => state.db }));

type Row = Record<string, unknown>;
const tables = new Map<unknown, Row[]>();

class Query {
  private table: unknown;
  private valuesToWrite: Row = {};
  constructor(private mode: 'select' | 'insert' | 'update', table?: unknown) { this.table = table; }
  from(table: unknown) { this.table = table; return this; }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  set(values: Row) { this.valuesToWrite = values; return this; }
  values(values: Row) { this.valuesToWrite = values; return this; }
  then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
  returning() { return Promise.resolve(this.run()); }
  private run(): Row[] {
    const rows = tables.get(this.table) ?? [];
    if (this.mode === 'select') return rows;
    if (this.mode === 'insert') {
      const row = { ...this.valuesToWrite, createdAt: new Date() };
      rows.push(row); tables.set(this.table, rows); return [row];
    }
    // The only preexisting transaction updates in this fixture are the two
    // missing FX rows, visited in journal order.
    if (this.table === transactions && 'fxRateToBRL' in this.valuesToWrite) {
      const row = rows.find((item) => item.fxRateToBRL == null)!;
      Object.assign(row, this.valuesToWrite); return [row];
    }
    if (this.table === holdings) {
      Object.assign(rows[0]!, this.valuesToWrite); return [rows[0]!];
    }
    return rows;
  }
}

interface MockDb {
  select: () => Query;
  insert: (table: unknown) => Query;
  update: (table: unknown) => Query;
  execute: () => Promise<void>;
  transaction: <T>(callback: (tx: MockDb) => Promise<T>) => Promise<T>;
}
function db(): MockDb {
  return {
    select: () => new Query('select'),
    insert: (table: unknown) => new Query('insert', table),
    update: (table: unknown) => new Query('update', table),
    execute: async () => undefined,
    transaction: async <T>(callback: (tx: MockDb) => Promise<T>): Promise<T> => {
      const snapshot = new Map([...tables].map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
      try { return await callback(db()); }
      catch (error) {
        tables.clear();
        for (const [table, rows] of snapshot) tables.set(table, rows);
        throw error;
      }
    },
  };
}

const ids = { userId: 'u', portfolioId: 'p', accountId: 'a', assetId: 'asset' };
beforeEach(() => {
  tables.clear();
  tables.set(accounts, [{ id: 'a' }]);
  tables.set(assets, [{ id: 'asset', currency: 'USD' }]);
  tables.set(transactions, ['first', 'second'].map((id, index) => ({
    id, ...ids, type: 'buy', date: new Date(`2025-01-0${index + 1}T00:00:00Z`),
    createdAt: new Date(), currency: 'USD', fxRateToBRL: null,
    qty: 1n, unitPriceCents: 1000n, feeCents: 0n, factor: null, amortRateCents: null,
  })));
  tables.set(holdings, [{ id: 'holding', ...ids, qty: 2n, costBasisCents: 2000n }]);
  state.db = db();
});

it('restores a migrated two-event USD holding atomically, then permits normal journal replay', async () => {
  const input = { ...ids, type: 'buy' as const, date: new Date('2025-01-03T00:00:00Z'),
    qty: 1n, unitPriceCents: 1000n, feeCents: 0n, fxRateToBRL: 6_000_000n };
  await expect(appendJournalEvent(input)).rejects.toMatchObject({ code: 'JOURNAL', message: expect.stringContaining('first, second') });
  expect(tables.get(transactions)).toHaveLength(2);
  await expect(repairHistoricalFx('u', 'p', 'a', 'asset', [
    { transactionId: 'first', fxRateToBRL: 5_000_000n },
  ])).rejects.toBeInstanceOf(JournalServiceError);
  expect(tables.get(transactions)?.every((row) => row.fxRateToBRL == null)).toBe(true);
  expect(tables.get(holdings)?.[0]?.costBasisCents).toBe(2000n);
  expect(await repairHistoricalFx('u', 'p', 'a', 'asset', [
    { transactionId: 'first', fxRateToBRL: 5_000_000n },
    { transactionId: 'second', fxRateToBRL: 5_500_000n },
  ])).toEqual({ repaired: 2 });
  expect(tables.get(holdings)?.[0]).toMatchObject({ qty: 2n, costBasisCents: 10500n });
  await appendJournalEvent(input);
  expect(tables.get(holdings)?.[0]).toMatchObject({ qty: 3n, costBasisCents: 16500n });
});
