import { describe, expect, it, vi } from 'vitest';
import type { AssetTable } from '../src/db/schema.js';
import type { HoldingWithAsset } from '../src/repositories/holdings.js';
import type { ValuationMap } from '../src/services/valuation.js';
import { refreshAssetBatch } from '../src/worker/jobs/quote-refresh.js';
import { snapshotTotals } from '../src/worker/jobs/snapshot.js';
import { createScheduler, dueJobs, isTradingDay, localTime } from '../src/worker/scheduler.js';

describe('worker', () => {
  it('uses São Paulo civil time at market close and skips weekends and B3 holidays', () => {
    expect(localTime(new Date('2026-06-01T21:00:00Z'))).toMatchObject({ date: '2026-06-01', hour: 18 });
    expect(dueJobs(new Date('2026-06-01T21:00:00Z'))).toEqual(['snapshots']);
    expect(dueJobs(new Date('2026-06-01T20:59:00Z'))).toEqual(['quotes']);
    expect(dueJobs(new Date('2026-06-06T21:00:00Z'))).toEqual([]);
    expect(isTradingDay('2026-04-03')).toBe(false); // Good Friday
    expect(isTradingDay('2026-06-04')).toBe(false); // Corpus Christi
    expect(isTradingDay('2026-06-01')).toBe(true);
  });

  it('does not overlap jobs and reports failure without stopping the scheduler', async () => {
    const date = new Date('2026-06-01T21:00:00Z');
    let release: (() => void) | undefined;
    const quotes = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const snapshots = vi.fn(async () => { throw new Error('missing quote'); });
    const error = vi.fn();
    const scheduler = createScheduler({ quotes, snapshots, dividends: vi.fn(), backups: vi.fn() },
      () => date, { info: vi.fn(), error });
    scheduler.tick();
    await Promise.resolve();
    scheduler.tick();
    expect(snapshots).toHaveBeenCalledTimes(1);
    date.setTime(Date.parse('2026-06-01T21:15:00Z'));
    scheduler.tick();
    await Promise.resolve();
    scheduler.tick();
    expect(quotes).toHaveBeenCalledTimes(1);
    release?.();
    await scheduler.stop();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('missing quote'));
  });

  it('refreshes only expired quotes, isolates provider errors and preserves fresh entries', async () => {
    const batch = ['FRESH', 'EXPIRED', 'FAIL'].map((symbol) => ({ id: symbol, symbol, class: 'acao' }) as AssetTable);
    const cached = vi.fn(async () => [{ asset: batch[0]!, quote: { validUntil: new Date('2026-06-01T21:20:00Z') } }]) as unknown as Parameters<typeof refreshAssetBatch>[1];
    const fetchQuote = vi.fn(async (symbol: string) => {
      if (symbol === 'FAIL') throw new Error('offline');
      return { quote: { assetId: symbol } };
    }) as unknown as Parameters<typeof refreshAssetBatch>[2];
    const result = await refreshAssetBatch(batch, cached, fetchQuote, new Date('2026-06-01T21:00:00Z'));
    expect(result).toEqual({ updated: 1, fresh: 1, failed: 1 });
    expect(fetchQuote).toHaveBeenCalledTimes(2);
    expect(fetchQuote).not.toHaveBeenCalledWith('FRESH', 'acao');
  });

  it('computes exact integer snapshot totals and refuses missing or stale pricing', () => {
    const asset = { id: 'a', class: 'acao', sector: 'Energia' } as AssetTable;
    const holdings = [{ id: 'h', costBasisCents: 123n, realizedPnlCents: 0n, asset }] as HoldingWithAsset[];
    const values = new Map([['h', { marketValueCentsBRL: 987n, isStale: false }]]) as ValuationMap;
    expect(snapshotTotals(holdings, values)).toMatchObject({ totalValueCents: 987n,
      costBasisCents: 123n, allocationJsonb: { byClass: [{ key: 'acao', valueCents: '987', percent: 100 }] } });
    values.get('h')!.isStale = true;
    expect(snapshotTotals(holdings, values)).toBeNull();
    values.clear();
    expect(snapshotTotals(holdings, values)).toBeNull();
  });
});
