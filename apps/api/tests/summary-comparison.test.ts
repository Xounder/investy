import { describe, expect, it } from 'vitest';
import type { PortfolioSnapshotTable } from '../src/db/schema.js';
import type { HoldingWithAsset } from '../src/repositories/holdings.js';
import type { ValuationMap } from '../src/services/valuation.js';
import { compareSummary } from '../src/services/summary-comparison.js';

const now = new Date('2026-10-23T17:00:00Z');
const summary = {
  totalMarketValueCents: 24000n, totalCostBasisCents: 17000n,
  unrealizedPnlCents: 7000n, realizedPnlCents: 0n,
  holdingsCount: 1, unpricedCostBasisCents: 0n, currency: 'BRL' as const,
};
const holding = { id: 'h', costBasisCents: 17000n } as HoldingWithAsset;
const valued = new Map([['h', {
  marketValueCentsBRL: 24000n, isStale: false,
} as ValuationMap extends Map<string, infer V> ? V : never]]);
function snapshot(portfolioId: string, date: string, total: bigint, cost: bigint) {
  return { portfolioId, date: new Date(date), totalValueCents: total, costBasisCents: cost } as PortfolioSnapshotTable;
}

describe('observed BRL summary comparison', () => {
  it('compares BRL historical snapshot amounts, not native quote percentage', () => {
    const comparison = compareSummary(summary, [holding], valued, ['a'], [
      snapshot('a', '2026-10-22T21:00:00Z', 20000n, 15000n),
    ], now);
    expect(comparison).toMatchObject({
      previousDate: '2026-10-22', period: 'since_snapshot',
      kind: 'observed_value_including_cash_flows',
      total: { amountCents: 4000n, percent: 20 },
      cost: { amountCents: 2000n }, unrealized: { amountCents: 2000n, percent: 40 },
      dayMainChange: { amountCents: 4000n, percent: 20 },
    });
  });

  it('does not invent a missing portfolio on the most recent date', () => {
    const comparison = compareSummary(summary, [holding], valued, ['a', 'b'], [
      snapshot('a', '2026-10-22T21:00:00Z', 10000n, 7000n),
      snapshot('a', '2026-10-21T21:00:00Z', 9000n, 6500n),
      snapshot('b', '2026-10-21T22:00:00Z', 11000n, 8500n),
    ], now);
    expect(comparison.previousDate).toBe('2026-10-21');
    expect(comparison.total?.amountCents).toBe(4000n);
    expect(compareSummary(summary, [holding], valued, ['a', 'b'], [
      snapshot('a', '2026-10-22T21:00:00Z', 10000n, 7000n),
    ], now)).toMatchObject({ reason: 'INCOMPLETE_COVERAGE', total: null });
  });

  it('rejects same-local-day snapshots and missing BRL/FX valuation', () => {
    const today = snapshot('a', '2026-10-23T04:00:00Z', 20000n, 15000n);
    expect(compareSummary(summary, [holding], valued, ['a'], [today], now).total).toBeNull();
    const missing = new Map(valued);
    missing.set('h', { ...valued.get('h')!, marketValueCentsBRL: null, isStale: true });
    expect(compareSummary(summary, [holding], missing, ['a'], [
      snapshot('a', '2026-10-22T21:00:00Z', 20000n, 15000n),
    ], now)).toMatchObject({ reason: 'INCOMPLETE_VALUATION', hasStaleQuotes: true, total: null });
    missing.set('h', { ...valued.get('h')!, priceCents: 100n, priceCentsBRL: null, currency: 'USD', marketValueCentsBRL: null });
    expect(compareSummary(summary, [holding], missing, ['a'], [], now).reason).toBe('MISSING_FX');
  });

  it('keeps older holiday snapshots labelled with the actual date and nulls a zero denominator', () => {
    const comparison = compareSummary(summary, [holding], valued, ['a'], [
      snapshot('a', '2026-10-16T21:00:00Z', 0n, 0n),
    ], now);
    expect(comparison).toMatchObject({ previousDate: '2026-10-16', period: 'since_snapshot', total: { percent: null } });
    expect(compareSummary(summary, [holding], valued, ['a'], [], now)).toMatchObject({ reason: 'NO_SNAPSHOT', dayMainChange: null });
  });
});
