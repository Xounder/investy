import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrapiProvider } from '../src/services/market-data/brapi.js';
import { YahooProvider } from '../src/services/market-data/yahoo.js';
import { computeValuations, nativeDayChangePercent } from '../src/services/valuation.js';
import type { HoldingWithAsset } from '../src/repositories/holdings.js';

const { cached, overrides, fx } = vi.hoisted(() => ({ cached: vi.fn(), overrides: vi.fn(), fx: vi.fn() }));
vi.mock('../src/services/market-data/cache.js', () => ({ getCachedQuotes: cached }));
vi.mock('../src/services/market-data/overrides.js', () => ({ getUserOverridesByAssetIds: overrides }));
vi.mock('../src/services/market-data/fx.js', () => ({ getFxRate: fx }));

const row = (id: string): HoldingWithAsset => ({
  id, assetId: id, accountId: 'account', userId: 'alice', qty: 2n, costBasisCents: 100n,
  avgPriceCents: 50n, realizedPnlCents: 0n, updatedAt: new Date(),
  asset: { id, symbol: id, name: id, class: 'acao', currency: 'BRL' } as HoldingWithAsset['asset'],
});

beforeEach(() => { vi.clearAllMocks(); cached.mockResolvedValue([]); overrides.mockResolvedValue([]); fx.mockResolvedValue(null); });
afterEach(() => vi.unstubAllGlobals());

describe('TASK-07 native daily change', () => {
  it('parses actual brapi previous close, omits absent/invalid values, and preserves signed change', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ regularMarketPrice: 9, regularMarketPreviousClose: 10, currency: 'BRL' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ regularMarketPrice: 12, currency: 'BRL' }] }) });
    vi.stubGlobal('fetch', fetcher);
    expect(await new BrapiProvider().fetchQuote('PETR4', 'acao')).toMatchObject({ priceCents: 900n, previousCloseCents: 1000n });
    expect(await new BrapiProvider().fetchQuote('VALE3', 'acao')).not.toHaveProperty('previousCloseCents');
    expect(nativeDayChangePercent(900n, 1000n)).toBe(-10);
    expect(nativeDayChangePercent(1100n, 1000n)).toBe(10);
    expect(nativeDayChangePercent(1000n, 1000n)).toBe(0);
    expect(nativeDayChangePercent(100n, 0n)).toBeNull();
  });

  it('reads Yahoo chart previous close in the quote native currency without any FX conversion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 105, chartPreviousClose: 100, currency: 'USD' } }] } }) }));
    expect(await new YahooProvider().fetchQuote('VOO', 'etf_us')).toMatchObject({ priceCents: 10500n, previousCloseCents: 10000n, currency: 'USD' });
  });

  it('uses the same quote for both prices, nulls missing/override change, and never fetches per holding', async () => {
    cached.mockResolvedValue([
      { quote: { assetId: 'up', priceCents: 110n, previousCloseCents: 100n, currency: 'BRL' }, isExpired: false, isStale: false },
      { quote: { assetId: 'down', priceCents: 90n, previousCloseCents: 100n, currency: 'BRL' }, isExpired: true, isStale: false },
      { quote: { assetId: 'missing', priceCents: 100n, previousCloseCents: null, currency: 'BRL' }, isExpired: false, isStale: false },
    ]);
    overrides.mockResolvedValue([{ assetId: 'up', priceCents: 120n, currency: 'BRL' }]);
    const valuations = await computeValuations('alice', ['up', 'down', 'missing', 'unpriced'].map(row));
    expect(valuations.get('up')).toMatchObject({ dayChangePercent: null, isOverride: true });
    expect(valuations.get('down')).toMatchObject({ dayChangePercent: -10, isStale: true });
    expect(valuations.get('missing')?.dayChangePercent).toBeNull();
    expect(valuations.get('unpriced')?.dayChangePercent).toBeNull();
    expect(cached).toHaveBeenCalledTimes(1);
    expect(overrides).toHaveBeenCalledWith('alice', ['up', 'down', 'missing', 'unpriced']);
    expect(fx).not.toHaveBeenCalled();
  });
});
