import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accounts, assets, holdings, transactions } from '../src/db/schema.js';
import {
  appendJournalEvent,
  deleteJournalEvent,
  replayJournal,
  updateJournalEvent,
} from '../src/services/journal.js';

const { state } = vi.hoisted(() => ({ state: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => state.db }));

type Row = Record<string, unknown>;
const data = new Map<unknown, Row[]>();
let failHoldingWrite = false;

class Query {
  table: unknown;
  payload: Row = {};
  mode: 'select' | 'insert' | 'update' | 'delete';
  constructor(mode: Query['mode'], table?: unknown) { this.mode = mode; this.table = table; }
  from(table: unknown) { this.table = table; return this; }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  set(values: Row) { this.payload = values; return this; }
  values(values: Row) { this.payload = values; return this; }
  async execute() { return undefined; }
  then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
  returning() { return Promise.resolve(this.run()); }
  private run(): Row[] {
    const rows = data.get(this.table) ?? [];
    if (this.mode === 'select') return rows;
    if (this.mode === 'insert') {
      if (this.table === holdings && failHoldingWrite) throw new Error('recompute failed');
      const row = { ...this.payload, id: this.payload.id ?? `row-${rows.length + 1}`, createdAt: new Date() };
      rows.push(row); data.set(this.table, rows); return [row];
    }
    if (this.mode === 'update') {
      if (this.table === holdings && failHoldingWrite) throw new Error('recompute failed');
      if (!rows.length) return [];
      Object.assign(rows[0]!, this.payload); return [rows[0]!];
    }
    data.set(this.table, []); return [];
  }
}

function makeDb(): {
  select: () => Query;
  insert: (table: unknown) => Query;
  update: (table: unknown) => Query;
  delete: (table: unknown) => Query;
  execute: () => Promise<undefined>;
  transaction: <T>(callback: (tx: ReturnType<typeof makeDb>) => Promise<T>) => Promise<T>;
} {
  return {
    select: () => new Query('select'),
    insert: (table: unknown) => new Query('insert', table),
    update: (table: unknown) => new Query('update', table),
    delete: (table: unknown) => new Query('delete', table),
    execute: async () => undefined,
    transaction: async <T>(callback: (tx: ReturnType<typeof makeDb>) => Promise<T>) => {
      const snapshot = new Map([...data].map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
      const tx = makeDb();
      try { return await callback(tx); }
      catch (error) { data.clear(); for (const [table, rows] of snapshot) data.set(table, rows); throw error; }
    },
  };
}

const base = {
  userId: 'user-1', portfolioId: 'portfolio-1', accountId: 'account-1', assetId: 'asset-1',
  date: new Date('2025-01-01T00:00:00Z'), qty: 10n, unitPriceCents: 1000n,
  feeCents: 0n, type: 'buy' as const,
};

beforeEach(() => {
  data.clear(); failHoldingWrite = false;
  data.set(accounts, [{ id: base.accountId }]); data.set(assets, [{ id: base.assetId }]);
  data.set(transactions, []); data.set(holdings, []);
  state.db = makeDb();
});

describe('journal service', () => {
  it('replays buy and sell events into quantity, basis, and realized P&L', () => {
    const result = replayJournal([
      { ...base, factor: null, amortRateCents: null },
      { ...base, type: 'sell', date: new Date('2025-02-01T00:00:00Z'), qty: 4n, unitPriceCents: 1500n, factor: null, amortRateCents: null },
    ]);
    expect(result.qty).toBe(6n);
    expect(result.costBasisCents).toBe(6000n);
    expect(result.realizedPnlCents).toBe(2000n);
  });

  it('atomically appends and recomputes a holding', async () => {
    await appendJournalEvent(base);
    expect(data.get(transactions)).toHaveLength(1);
    expect(data.get(holdings)?.[0]).toMatchObject({ qty: 10n, costBasisCents: 10000n });
  });

  it('updates and deletes journal events while recomputing the holding', async () => {
    const row = await appendJournalEvent(base);
    await updateJournalEvent(base.userId, row.id, { qty: 5n });
    expect(data.get(holdings)?.[0]?.qty).toBe(5n);
    await deleteJournalEvent(base.userId, row.id);
    expect(data.get(transactions)).toHaveLength(0);
    expect(data.get(holdings)).toHaveLength(0);
  });

  it('rolls back the journal append when holding recompute fails', async () => {
    failHoldingWrite = true;
    await expect(appendJournalEvent(base)).rejects.toThrow('recompute failed');
    expect(data.get(transactions)).toHaveLength(0);
    expect(data.get(holdings)).toHaveLength(0);
  });
});
