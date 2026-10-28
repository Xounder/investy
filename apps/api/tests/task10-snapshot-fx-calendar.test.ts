import { describe, expect, it, vi } from 'vitest';
import type { AssetTable, QuoteTable, TransactionTable } from '../src/db/schema.js';
import { portfolioSnapshots, portfolios, quoteOverrides, quotes, transactions } from '../src/db/schema.js';
import { captureClose } from '../src/worker/jobs/snapshot.js';
import { asOfFx } from '../src/worker/jobs/close-fx.js';
import { isTradingDay } from '../src/worker/b3-calendar.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));

const close = new Date('2026-06-01T21:00:00Z');
const equity = { id: 'etf', class: 'etf_us', currency: 'USD', sector: null } as AssetTable;
const fxAsset = { id: 'fx', symbol: 'USDBRL', currency: 'BRL' } as AssetTable;
const quote = (assetId: string, priceCents: bigint, fetchedAt: Date, validUntil: Date,
  fxRateToBRL: bigint | null = null) => ({ id: crypto.randomUUID(), assetId, priceCents,
    fetchedAt, validUntil, fxRateToBRL, currency: assetId === 'fx' ? 'BRL' : 'USD', isStale: false } as QuoteTable);

class CloseDb {
  readonly writes: Array<{ totalValueCents: bigint; costBasisCents: bigint; allocationJsonb: object }> = [];
  pricedReads = 0;
  fxReads = 0;
  override = false;
  price = quote('etf', 120n, new Date('2026-06-01T20:59:00Z'), new Date('2026-06-01T21:14:00Z'));
  fx = quote('fx', 0n, new Date('2026-05-29T18:00:00Z'), new Date('2026-06-05T18:00:00Z'), 5_000_000n);
  readonly event = { id: 'buy', userId: 'alice', portfolioId: 'p', accountId: 'a', assetId: 'etf',
    type: 'buy', qty: 2n, unitPriceCents: 100n, feeCents: 0n, currency: 'USD', fxRateToBRL: 5_000_000n,
    date: new Date('2026-05-28T16:00:00Z'), createdAt: new Date('2026-05-28T16:00:01Z'),
    factor: null, amortRateCents: null } as TransactionTable;
  async transaction<T>(fn: (tx: CloseDb) => Promise<T>): Promise<T> { return fn(this); }
  async execute(): Promise<void> { }
  select(selection?: Record<string, unknown>) {
    let table: unknown;
    let predicate: unknown;
    const query = {
      from(value: unknown) { table = value; return query; },
      innerJoin() { return query; },
      where(value: unknown) { predicate = value; return query; },
      orderBy() { return query; },
      limit(n: number) { return Promise.resolve(rows().slice(0, n)); },
      then(resolve: (result: unknown[]) => unknown) { return Promise.resolve(resolve(rows())); },
    };
    const rows = () => {
      const { values } = whereFacts(predicate);
      if (table === portfolios) return values.includes('') ? [{ id: 'p', userId: 'alice',
        createdAt: new Date('2026-05-01T00:00:00Z') }] : [];
      if (table === portfolioSnapshots) return [];
      if (table === transactions) return [{ transaction: this.event, asset: equity }];
      if (table === quoteOverrides) return this.override ? [{ assetId: equity.id }] : [];
      if (table === quotes && selection?.quote) {
        if (values.includes('USDBRL')) { this.fxReads++; return [{ quote: this.fx, asset: fxAsset }]; }
        this.pricedReads++;
        const recorded = this.price;
        // Simulate a newly hydrated latest quote appearing after the validated read.
        this.price = quote('etf', 999n, new Date('2026-06-01T21:01:00Z'),
          new Date('2026-06-01T21:16:00Z'));
        return [{ quote: recorded, asset: equity }];
      }
      return [];
    };
    return query;
  }
  insert(table: unknown) {
    expect(table).toBe(portfolioSnapshots);
    return { values: (row: CloseDb['writes'][number]) => ({ onConflictDoNothing: async () => {
      this.writes.push(row);
    } }) };
  }
}

describe('snapshot close QA', () => {
  it('persists the one as-of journal, price and FX read instead of a subsequently hydrated quote/current FX', async () => {
    const db = new CloseDb(); holder.db = db;
    await captureClose(close);
    expect(db.writes).toMatchObject([{ totalValueCents: 1200n, costBasisCents: 1000n }]);
    expect(db.pricedReads).toBe(1);
    expect(db.fxReads).toBe(1);
    expect(db.writes[0]?.allocationJsonb).toMatchObject({ priceBasis: 'observed_intraday_valid_at_close' });
  });

  it('does not apply an override of unknown history or FX recorded after close', async () => {
    const db = new CloseDb(); holder.db = db; db.override = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try { await captureClose(close); } finally { log.mockRestore(); }
    expect(db.writes).toEqual([]);
    const future = quote('fx', 0n, new Date('2026-06-01T21:01:00Z'),
      new Date('2026-06-08T21:01:00Z'), 9_000_000n);
    expect(asOfFx(future, close)).toBeNull();
  });

  it('allows recorded weekly FX across a weekend or weekday, not expired/stale/future rates', () => {
    const friday = quote('fx', 0n, new Date('2026-05-29T18:00:00Z'),
      new Date('2026-06-05T18:00:00Z'), 5_000_000n);
    expect(asOfFx(friday, close)).toBe(5_000_000n); // Friday to Monday
    expect(asOfFx(friday, new Date('2026-06-02T21:00:00Z'))).toBe(5_000_000n);
    expect(asOfFx(friday, new Date('2026-06-05T18:00:00Z'))).toBeNull();
    expect(asOfFx({ ...friday, isStale: true }, close)).toBeNull();
    expect(asOfFx({ ...friday, fetchedAt: new Date('2026-06-01T21:01:00Z') }, close)).toBeNull();
    expect(asOfFx({ ...friday, validUntil: new Date('2026-06-01T21:01:00Z') }, close)).toBeNull();
    expect(asOfFx(quote('fx', 0n, new Date('2026-06-01T20:59:00Z'),
      new Date('2026-06-01T21:14:00Z'), 5_000_000n), close)).toBe(5_000_000n);
  });

  it('matches independent B3 published 2021/22 sessions; limits 2026 rules and fails closed elsewhere', () => {
    // B3: https://www.b3.com.br/en_us/solutions/platforms/puma-trading-system/for-members-and-traders/trading-calendar/holidays/
    expect(isTradingDay('2021-01-25')).toBe(false);
    expect(isTradingDay('2022-01-25')).toBe(true);
    expect(isTradingDay('2021-02-17')).toBe(true); // Ash Wednesday afternoon session.
    expect(isTradingDay('2022-03-02')).toBe(true);
    expect(isTradingDay('2022-03-01')).toBe(false); // Carnival full closure.
    expect(isTradingDay('2026-02-18')).toBe(true); // Limited 2026 rule, not an audited year.
    expect(isTradingDay('2026-07-09')).toBe(true); // No fixed city-wide closure inferred.
    expect(isTradingDay('2025-06-02')).toBe(false); // Unsupported year fails closed.
  });
});
