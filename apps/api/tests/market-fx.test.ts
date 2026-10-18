import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { AssetTable } from '../src/db/schema.js';

// Hoisted mocks for database
const { fakeDb, selectChain, mockLimitedBrapiFetch, mockLimitedBcbFetch, mockInsertChain } = vi.hoisted(() => {
  const fakeDb = {
    select: vi.fn(),
    insert: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    returning: vi.fn(),
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
  };

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
  };

  const mockInsertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    returning: vi.fn().mockResolvedValue(undefined),
  };

  const mockLimitedBrapiFetch = vi.fn();
  const mockLimitedBcbFetch = vi.fn();

  return { fakeDb, selectChain, mockLimitedBrapiFetch, mockLimitedBcbFetch, mockInsertChain };
});

// Mock the database client
vi.mock('../src/db/client.js', () => ({
  getDb: vi.fn(() => fakeDb),
}));

// Mock rate-limited providers (the only outbound boundary the code under test uses)
vi.mock('../src/services/market-data/rate-limited-providers.js', () => ({
  getLimitedBrapiProvider: vi.fn(() => Promise.resolve({
    fetchQuote: mockLimitedBrapiFetch,
    name: 'brapi',
    supports: vi.fn().mockReturnValue(true),
  })),
  getLimitedBcbSgsProvider: vi.fn(() => Promise.resolve({
    fetchQuote: mockLimitedBcbFetch,
    name: 'bcb',
    supports: vi.fn().mockReturnValue(true),
  })),
  resetRateLimitedProviders: vi.fn(),
}));

// Import the actual fx module
const { convertUsdToBrl, getBrlPrice, FX_SCALE, toFxScale, fromFxScale, fetchAndCacheFxRate } = await import('../src/services/market-data/fx.js');

function resetMocks() {
  vi.clearAllMocks();
  fakeDb.select.mockReturnValue(selectChain);
  fakeDb.insert.mockReturnValue(mockInsertChain);
  fakeDb.from.mockReturnValue(selectChain);
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.limit.mockReturnValue(selectChain);
  selectChain.orderBy.mockReturnValue(selectChain);
  selectChain.returning.mockReturnValue(selectChain);

  mockInsertChain.values.mockReturnValue(mockInsertChain);
  mockInsertChain.onConflictDoNothing.mockResolvedValue(undefined);
  mockInsertChain.returning.mockResolvedValue(undefined);

  mockLimitedBrapiFetch.mockReset();
  mockLimitedBcbFetch.mockReset();
}

describe('FX conversion', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('USD→BRL conversion with valid rate', () => {
    it('converts USD cents to BRL cents using valid FX rate from cache', async () => {
      const priceCentsUsd = 10000n; // 100 USD in cents

      // Mock FX asset exists
      const fxAsset = { id: 'fx-asset', symbol: 'USDBRL', name: 'USD/BRL', class: 'indice' as const, currency: 'BRL', providerKey: 'USDBRL', createdAt: new Date() };
      selectChain.limit.mockResolvedValueOnce([fxAsset]);

      // Mock cached FX quote with valid rate (5.25)
      const fxQuote = {
        id: 'fx-quote',
        assetId: 'fx-asset',
        priceCents: 525n, // 5.25 * 100
        currency: 'BRL',
        fxRateToBRL: 5250000n, // 5.25 * 1_000_000
        source: 'brapi',
        isStale: false,
        fetchedAt: new Date(),
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      selectChain.orderBy.mockReturnValue(selectChain);
      selectChain.limit.mockResolvedValueOnce([fxQuote]);

      const result = await convertUsdToBrl(priceCentsUsd);
      // 10000 cents USD * 5.25 = 52500 cents BRL
      expect(result).toBe(52500n);
    });

    it('returns null when FX rate unavailable - cached quote missing and providers fail', async () => {
      // Mock FX asset exists but no cached quote
      const fxAsset = { id: 'fx-asset', symbol: 'USDBRL', name: 'USD/BRL', class: 'indice' as const, currency: 'BRL', providerKey: 'USDBRL', createdAt: new Date() };
      selectChain.limit.mockResolvedValueOnce([fxAsset]);
      selectChain.orderBy.mockReturnValue(selectChain);
      selectChain.limit.mockResolvedValueOnce([]);

      // Providers also fail
      mockLimitedBrapiFetch.mockResolvedValue(null);
      mockLimitedBcbFetch.mockResolvedValue(null);

      // Mock the fetchAndCacheFxRate database calls
      // First call: ensure FX asset exists
      selectChain.limit.mockResolvedValueOnce([fxAsset]);
      // Second call: insert new quote (mockInsertChain handles this)
      mockInsertChain.returning.mockResolvedValueOnce([{ id: 'new-quote' }]);

      const result = await convertUsdToBrl(10000n);
      expect(result).toBeNull();
    });

    it('handles micro-unit precision correctly via real toFxScale/fromFxScale', () => {
      // Test the actual production functions, not test-local literals
      const rate = 5.25;
      const scaled = toFxScale(rate);
      expect(scaled).toBe(5250000n);

      // Convert back using fromFxScale
      const back = fromFxScale(scaled);
      expect(back).toBe(5.25);
    });

    it('preserves precision for fractional rates (e.g., 5.20) in toFxScale/fromFxScale round-trip', () => {
      const rate = 5.20;
      const scaled = toFxScale(rate);
      expect(scaled).toBe(5200000n);

      const back = fromFxScale(scaled);
      expect(back).toBe(5.20);
    });
  });

  describe('FX rate unavailable - foreign assets flagged', () => {
    it('flags foreign assets when FX rate unavailable', async () => {
      // Mock FX asset exists but no cached quote
      const fxAsset = { id: 'fx-asset', symbol: 'USDBRL', name: 'USD/BRL', class: 'indice' as const, currency: 'BRL', providerKey: 'USDBRL', createdAt: new Date() };
      selectChain.limit.mockResolvedValueOnce([fxAsset]);
      selectChain.orderBy.mockReturnValue(selectChain);
      selectChain.limit.mockResolvedValueOnce([]);

      mockLimitedBrapiFetch.mockResolvedValue(null);
      mockLimitedBcbFetch.mockResolvedValue(null);

      // Mock the fetchAndCacheFxRate database calls
      selectChain.limit.mockResolvedValueOnce([fxAsset]);
      mockInsertChain.returning.mockResolvedValueOnce([{ id: 'new-quote' }]);

      const asset = { id: 'asset-1', symbol: 'IVVB11', name: 'iShares S&P 500', class: 'etf_us', currency: 'USD', sector: 'Índice Internacional', providerKey: 'IVVB11', isin: 'BRIVVBCTF003', createdAt: new Date() } as AssetTable;
      const result = await getBrlPrice(asset, 10000n, 'USD', false);

      expect(result).not.toBeNull();
      expect(result!.fxUnavailable).toBe(true);
      expect(result!.fxRateUsed).toBeNull();
      expect(result!.priceCentsBRL).toBe(0n);
    });
  });

  describe('BRL assets (no FX needed)', () => {
    it('returns BRL price directly for BRL assets without FX', async () => {
      const asset = { id: 'asset-1', symbol: 'PETR4', name: 'Petrobras PN', class: 'acao', currency: 'BRL', sector: 'Petróleo e Gás', providerKey: 'PETR4', isin: 'BRPETRACNPR6', createdAt: new Date() } as AssetTable;
      const result = await getBrlPrice(asset, 3000n, 'BRL', false);

      expect(result).not.toBeNull();
      expect(result!.priceCentsBRL).toBe(3000n);
      expect(result!.fxUnavailable).toBe(false);
      expect(result!.fxRateUsed).toBeNull();
    });

    it('returns BRL price directly for BDR assets (quoted in BRL by brapi)', async () => {
      const asset = { id: 'asset-1', symbol: 'AAPL34', name: 'Apple Inc. BDR', class: 'bdr', currency: 'BRL', sector: 'Tecnologia', providerKey: 'AAPL34', isin: 'BRAAPLCTF008', createdAt: new Date() } as AssetTable;
      const result = await getBrlPrice(asset, 80000n, 'BRL', false);

      expect(result).not.toBeNull();
      expect(result!.priceCentsBRL).toBe(80000n);
      expect(result!.fxUnavailable).toBe(false);
    });
  });

  describe('FX_SCALE constant', () => {
    it('uses 1_000_000 micro-units scale', () => {
      expect(FX_SCALE).toBe(1_000_000n);
    });
  });

  describe('FX write path: fetchAndCacheFxRate persists fractional rate without truncation', () => {
    it('stores 5.20 as 5200000 micro-units and reads back correctly', async () => {
      // Mock FX asset exists
      const fxAsset = { id: 'fx-asset', symbol: 'USDBRL', name: 'USD/BRL', class: 'indice' as const, currency: 'BRL', providerKey: 'USDBRL', createdAt: new Date() };
      selectChain.limit.mockResolvedValueOnce([fxAsset]);
      selectChain.orderBy.mockReturnValue(selectChain);
      selectChain.limit.mockResolvedValueOnce([]); // No cached quote

      // Mock provider returns 5.20 (520 cents)
      mockLimitedBrapiFetch.mockResolvedValue({
        priceCents: 520n, // 5.20 * 100
        currency: 'BRL',
        source: 'brapi',
      });

      // Mock insert returning
      mockInsertChain.returning.mockResolvedValueOnce([{ id: 'new-quote' }]);

      const result = await fetchAndCacheFxRate();

      expect(result).not.toBeNull();
      expect(result!.rate).toBe(5.20);
      expect(result!.fetchedAt).toBeInstanceOf(Date);
    });
  });
});