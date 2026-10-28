import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeValuations } from '../src/services/valuation.js';
import { computeAllocation, computeSummary } from '../src/services/portfolio-summary.js';
import type { HoldingWithAsset } from '../src/repositories/holdings.js';

const { cached, overrides, fx } = vi.hoisted(() => ({ cached: vi.fn(), overrides: vi.fn(), fx: vi.fn() }));
vi.mock('../src/services/market-data/cache.js', () => ({ getCachedQuotes: cached }));
vi.mock('../src/services/market-data/overrides.js', () => ({ getUserOverridesByAssetIds: overrides }));
vi.mock('../src/services/market-data/fx.js', () => ({ getFxRate: fx }));

function holding(id: string, assetClass: string, currency: string, qty: bigint, cost: bigint): HoldingWithAsset {
  return { id, assetId: id, accountId: 'a', userId: 'alice', qty, costBasisCents: cost,
    avgPriceCents: 0n, realizedPnlCents: 23n, updatedAt: new Date(),
    asset: { id, symbol: id, name: id, class: assetClass, sector: id === 'usd' ? null : 'Finance', currency } as HoldingWithAsset['asset'] };
}

beforeEach(() => { vi.clearAllMocks(); overrides.mockResolvedValue([]); cached.mockResolvedValue([]); fx.mockResolvedValue(null); });

describe('TASK-05 valuation and aggregate arithmetic', () => {
  it('prefers override to stale quote, converts USD, and excludes unpriced assets from unrealized P&L', async () => {
    const rows = [holding('brl', 'acao', 'BRL', 3n, 300n), holding('usd', 'etf_us', 'USD', 2n, 700n), holding('unknown', 'fii', 'BRL', 1n, 900n)];
    cached.mockResolvedValue([
      { quote: { assetId: 'brl', priceCents: 100n, currency: 'BRL' }, isStale: true, isExpired: false },
      { quote: { assetId: 'usd', priceCents: 101n, currency: 'USD' }, isStale: true, isExpired: false },
    ]);
    overrides.mockResolvedValue([{ assetId: 'brl', priceCents: 120n, currency: 'BRL' }]);
    fx.mockResolvedValue({ rate: 5.25, fetchedAt: new Date() });
    const values = await computeValuations('alice', rows);
    expect(values.get('brl')).toMatchObject({ priceCentsBRL: 120n, marketValueCentsBRL: 360n, isOverride: true, isStale: false });
    expect(values.get('usd')).toMatchObject({ priceCentsBRL: 530n, marketValueCentsBRL: 1060n, isStale: true });
    expect(values.get('unknown')?.marketValueCentsBRL).toBeNull();
    expect(fx).toHaveBeenCalledTimes(1);
    expect(computeSummary(rows, values)).toMatchObject({ totalMarketValueCents: 1420n, totalCostBasisCents: 1900n, unrealizedPnlCents: 420n, realizedPnlCents: 69n, unpricedCostBasisCents: 900n });
    const allocation = computeAllocation(rows, values);
    expect(allocation.byClass.map((slice) => slice.valueCents)).toEqual([1060n, 900n, 360n]);
    expect(allocation.byClass.reduce((sum, slice) => sum + slice.valueCents, 0n)).toBe(2320n);
  });

  it('does not manufacture a zero BRL valuation if FX is unavailable', async () => {
    const rows = [holding('usd', 'etf_us', 'USD', 2n, 700n)];
    cached.mockResolvedValue([{ quote: { assetId: 'usd', priceCents: 101n, currency: 'USD' }, isStale: false, isExpired: false }]);
    const values = await computeValuations('alice', rows);
    expect(values.get('usd')).toMatchObject({ priceCents: 101n, priceCentsBRL: null, marketValueCentsBRL: null, unrealizedPnlCentsBRL: null, isStale: true });
    expect(computeSummary(rows, values).unpricedCostBasisCents).toBe(700n);
  });
});
