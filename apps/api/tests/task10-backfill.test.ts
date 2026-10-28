import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { AssetTable, QuoteTable, TransactionTable } from '../src/db/schema.js';
import { portfolioSnapshots, quoteOverrides, quotes, snapshotBackfillProgress, transactions } from '../src/db/schema.js';
import { historicalTotals, type HistoricalQuote, type HistoricalRow } from '../src/worker/jobs/backfill-calculate.js';
import { backfillPortfolio, DAYS_PER_PORTFOLIO } from '../src/worker/jobs/backfill.js';
import { refreshAssetBatch } from '../src/worker/jobs/quote-refresh.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
const close = (day: string) => new Date(`${day}T21:00:00Z`);
const asset = { id: 'share', class: 'acao', sector: 'Industria', currency: 'BRL' } as AssetTable;
const usd = { ...asset, id: 'dollar', class: 'etf_us', currency: 'USD' } as AssetTable;
function event(id: string, type: TransactionTable['type'], date: string, qty: bigint, unitPriceCents: bigint,
  currency = 'BRL', fxRateToBRL: bigint | null = null, factor: number | null = null,
  owner = 'alice', portfolioId = 'p', linkedAsset = asset): HistoricalRow {
  return { asset: linkedAsset, transaction: { id, type, date: new Date(`${date}T15:00:00Z`),
    createdAt: new Date(`${date}T15:01:00Z`), userId: owner, portfolioId,
    accountId: 'a', assetId: linkedAsset.id, qty, unitPriceCents, feeCents: 0n,
    realizedPnlCents: 0n, currency, fxRateToBRL, factor, amortRateCents: null } as TransactionTable };
}
function observed(day: string, priceCents: bigint, linkedAsset = asset): HistoricalQuote {
  return { asset: linkedAsset, quote: { assetId: linkedAsset.id, fetchedAt: new Date(`${day}T20:59:00Z`),
    validUntil: new Date(`${day}T21:14:00Z`), isStale: false, currency: linkedAsset.currency,
    priceCents } as QuoteTable };
}

describe('historical snapshot truth', () => {
  it('refreshes a still-fresh 17:45 quote when it will expire at the 18:00 close', async () => {
    const now = new Date('2026-06-01T20:59:00Z');
    const cached = vi.fn(async () => [{ asset, quote: { validUntil: close('2026-06-01') } }]) as unknown as Parameters<typeof refreshAssetBatch>[1];
    const fetch = vi.fn(async () => ({ quote: { assetId: asset.id } })) as unknown as Parameters<typeof refreshAssetBatch>[2];
    expect(await refreshAssetBatch([asset], cached, fetch, now, close('2026-06-01')))
      .toEqual({ updated: 1, fresh: 0, failed: 0 });
    expect(fetch).toHaveBeenCalledWith(asset.symbol, asset.class);
  });

  it('preserves the predecessor schema in migration 0007 and records only the new cursor table', async () => {
    const meta = new URL('../drizzle/meta/', import.meta.url);
    const prior = JSON.parse(await readFile(new URL('0006_snapshot.json', meta), 'utf8'));
    const next = JSON.parse(await readFile(new URL('0007_snapshot.json', meta), 'utf8'));
    expect(next.prevId).toBe(prior.id);
    const { 'public.snapshot_backfill_progress': added, ...untouched } = next.tables;
    expect(untouched).toEqual(prior.tables);
    expect(next.enums).toEqual(prior.enums);
    expect(added.columns).toMatchObject({ portfolio_id: { primaryKey: true },
      user_id: { notNull: true }, last_date: { type: 'varchar(10)' } });
    expect(added.foreignKeys.snapshot_backfill_progress_user_id_users_id_fk.onDelete).toBe('cascade');
    const sql = await readFile(new URL('../drizzle/0007_snapshot_backfill_progress.sql', import.meta.url), 'utf8');
    expect(sql).toContain('"portfolio_id" text PRIMARY KEY NOT NULL REFERENCES "portfolios"("id") ON DELETE CASCADE');
  });

  it('replays buys, sells and splits as of each close with exact persisted BRL cost basis', () => {
    const rows = [event('buy', 'buy', '2026-06-01', 2n, 100n),
      event('split', 'split', '2026-06-03', 0n, 0n, 'BRL', null, 2),
      event('sale', 'sell', '2026-06-04', 1n, 150n)];
    expect(historicalTotals(rows, [observed('2026-06-01', 200n)], undefined, new Set(), close('2026-06-01')))
      .toMatchObject({ totalValueCents: 400n, costBasisCents: 200n });
    expect(historicalTotals(rows, [observed('2026-06-03', 120n)], undefined, new Set(), close('2026-06-03')))
      .toMatchObject({ totalValueCents: 480n, costBasisCents: 200n });
    expect(historicalTotals(rows, [observed('2026-06-04', 125n)], undefined, new Set(), close('2026-06-04')))
      .toMatchObject({ totalValueCents: 375n, costBasisCents: 150n });
  });

  it('requires recorded historical prices, acquisition FX and close-day FX; never uses current overrides', () => {
    const rows = [event('usd', 'buy', '2026-06-01', 2n, 100n, 'USD', 5_250_000n, null, 'alice', 'p', usd)];
    const price = observed('2026-06-03', 120n, usd);
    expect(historicalTotals(rows, [price], undefined, new Set(), close('2026-06-03'))).toBeNull();
    const fx = { ...observed('2026-06-03', 525n), quote: { ...observed('2026-06-03', 525n).quote,
      fxRateToBRL: 5_250_000n } };
    expect(historicalTotals(rows, [price], fx, new Set(), close('2026-06-03')))
      .toMatchObject({ totalValueCents: 1260n, costBasisCents: 1050n });
    expect(historicalTotals(rows, [price], { ...fx, quote: { ...fx.quote,
      fetchedAt: new Date('2026-06-02T20:59:00Z') } }, new Set(), close('2026-06-03'))).toBeNull();
    expect(historicalTotals(rows, [price], fx, new Set([usd.id]), close('2026-06-03'))).toBeNull();
    expect(historicalTotals(rows, [observed('2026-06-08', 120n, usd)], fx, new Set(), close('2026-06-03'))).toBeNull();
  });
});

/** Exercises the real job against a constrained transactional DB/observation boundary (not live PG). */
class BackfillDb {
  failSnapshotInsert = false;
  events: HistoricalRow[] = [];
  prices: HistoricalQuote[] = [];
  overrides = new Set<string>();
  snapshots: Array<{ userId: string; portfolioId: string; date: Date; totalValueCents: bigint; costBasisCents: bigint }> = [];
  progress: Array<{ userId: string; portfolioId: string; lastDate: string }> = [];
  select(selection?: Record<string, unknown>) {
    let table: unknown;
    let predicate: unknown;
    let count = Infinity;
    const query = {
      from(value: unknown) { table = value; return query; },
      innerJoin() { return query; },
      where(value: unknown) { predicate = value; return query; },
      orderBy() { return query; }, groupBy() { return query; },
      limit(n: number) { count = n; return Promise.resolve(rows().slice(0, count)); },
      then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(resolve(rows().slice(0, count))); },
    };
    const rows = (): unknown[] => {
      const { values } = whereFacts(predicate);
      if (table === quotes && selection?.day) {
        const dates = [...new Set(this.prices.map((p) => p.quote.fetchedAt.toISOString().slice(0, 10)))].sort();
        const [after, before] = values.filter((v): v is string => typeof v === 'string' && /^\d{4}-/.test(v));
        return dates.filter((d) => d > (after ?? '') && d < (before ?? '9999-12-31'))
          .map((day) => ({ day, close: close(day) }));
      }
      if (table === snapshotBackfillProgress) return this.progress.filter((p) => values.includes(p.userId) && values.includes(p.portfolioId));
      if (table === portfolioSnapshots) return this.snapshots.filter((p) => values.includes(p.userId) && values.includes(p.portfolioId) &&
        values.some((v) => v instanceof Date && v.getTime() === p.date.getTime())).map((p) => ({ id: `${p.userId}:${p.date.toISOString()}` }));
      if (table === transactions) return this.events.filter((e) => values.includes(e.transaction.userId) &&
        values.includes(e.transaction.portfolioId) && values.some((v) => v instanceof Date && e.transaction.date <= v));
      if (table === quoteOverrides) return [...this.overrides].map((assetId) => ({ assetId }));
      if (table === quotes) {
        if (values.includes('USDBRL')) return [];
        return this.prices.filter((p) => values.includes(p.asset.id) &&
          values.some((v) => v instanceof Date && p.quote.fetchedAt <= v));
      }
      return [];
    };
    return query;
  }
  async transaction<T>(run: (tx: BackfillDb) => Promise<T>): Promise<T> { return run(this); }
  insert(table: unknown) {
    return { values: (row: Record<string, unknown>) => ({
      onConflictDoNothing: () => ({ returning: async () => {
        if (table !== portfolioSnapshots) throw new Error('Invalid table');
        if (this.failSnapshotInsert) throw new Error('injected snapshot insert failure');
        if (this.snapshots.some((p) => p.portfolioId === row.portfolioId && p.date.getTime() === (row.date as Date).getTime())) return [];
        this.snapshots.push(row as BackfillDb['snapshots'][number]);
        return [{ id: row.id }];
      } }),
      onConflictDoUpdate: async () => {
        if (table !== snapshotBackfillProgress) throw new Error('Invalid table');
        this.progress = this.progress.filter((p) => p.portfolioId !== row.portfolioId);
        this.progress.push(row as BackfillDb['progress'][number]);
      },
    }) };
  }
}

describe('capped resumable backfill job', () => {
  it('advances past unavailable/closed days, never duplicates or leaks another owner, then continues', async () => {
    const db = new BackfillDb(); holder.db = db;
    db.events = [event('buy', 'buy', '2026-06-01', 2n, 100n),
      event('split', 'split', '2026-06-03', 0n, 0n, 'BRL', null, 2),
      event('sale', 'sell', '2026-06-04', 1n, 150n),
      event('foreign', 'buy', '2026-06-01', 200n, 999n, 'BRL', null, null, 'bob', 'other')];
    db.prices = ['01', '03', '04', '05', '06', '08'].map((n) => observed(`2026-06-${n}`, 100n + BigInt(n)));
    db.prices.push(observed('2026-06-02', 700n, { ...asset, id: 'unrelated' }));
    const first = await backfillPortfolio('alice', 'p', '2026-06-09');
    expect(first).toEqual({ attempted: DAYS_PER_PORTFOLIO, created: 3, unavailable: 2 });
    expect(db.progress).toMatchObject([{ userId: 'alice', portfolioId: 'p', lastDate: '2026-06-05' }]);
    // June 4 is Corpus Christi; the sale's as-of journal effect appears on June 5.
    expect(db.snapshots.map((s) => s.date.toISOString().slice(0, 10))).toEqual(['2026-06-01', '2026-06-03', '2026-06-05']);
    expect(db.snapshots[2]).toMatchObject({ totalValueCents: 315n, costBasisCents: 150n });
    expect(await backfillPortfolio('alice', 'p', '2026-06-09')).toEqual({ attempted: 2, created: 1, unavailable: 1 });
    expect(db.progress[0]?.lastDate).toBe('2026-06-08');
    expect(await backfillPortfolio('alice', 'p', '2026-06-09')).toEqual({ attempted: 0, created: 0, unavailable: 0 });
    expect(db.snapshots).toHaveLength(4);
    expect(db.snapshots.every((s) => s.userId === 'alice' && s.portfolioId === 'p')).toBe(true);
  });

  it('retains its cursor when persistence fails, so the candidate can be retried', async () => {
    const db = new BackfillDb(); holder.db = db;
    db.events = [event('buy', 'buy', '2026-06-01', 2n, 100n)];
    db.prices = [observed('2026-06-01', 200n)];
    db.failSnapshotInsert = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await backfillPortfolio('alice', 'p', '2026-06-02'))
        .toEqual({ attempted: 0, created: 0, unavailable: 0 });
    } finally { log.mockRestore(); }
    expect(db.progress).toEqual([]);
    db.failSnapshotInsert = false;
    expect(await backfillPortfolio('alice', 'p', '2026-06-02'))
      .toEqual({ attempted: 1, created: 1, unavailable: 0 });
  });
});
