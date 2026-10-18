import { describe, expect, it, vi, beforeEach } from 'vitest';

import { searchAssets, getTrendingAssets, getAssetDetail, seedAssetCatalog } from '../src/services/assets/catalog.js';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';

// Hoisted mocks for DB and dependencies
const { fakeDb, selectChain, insertChain, mockGetCachedQuote, mockGetUserOverride, mockGetBrlPrice, mockSetUserOverride, mockGetAssetDetail, mockFindSessionByToken, mockAssetExistsQuery } = vi.hoisted(() => {
  const fakeDb = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    returning: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    orderBy: vi.fn(),
    offset: vi.fn(),
  };

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  };

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };

  const mockGetCachedQuote = vi.fn();
  const mockGetUserOverride = vi.fn();
  const mockGetBrlPrice = vi.fn();
  const mockSetUserOverride = vi.fn();
  const mockGetAssetDetail = vi.fn();
  const mockFindSessionByToken = vi.fn();
  const mockAssetExistsQuery = vi.fn();

  return { fakeDb, selectChain, insertChain, mockGetCachedQuote, mockGetUserOverride, mockGetBrlPrice, mockSetUserOverride, mockGetAssetDetail, mockFindSessionByToken, mockAssetExistsQuery };
});

vi.mock('../src/db/client.js', () => ({
  getDb: vi.fn(() => fakeDb),
}));

vi.mock('../src/services/market-data/cache.js', () => ({
  getCachedQuote: mockGetCachedQuote,
}));

vi.mock('../src/services/market-data/overrides.js', () => ({
  getUserOverride: mockGetUserOverride,
  setUserOverride: mockSetUserOverride,
}));

vi.mock('../src/services/market-data/fx.js', () => ({
  getBrlPrice: mockGetBrlPrice,
}));

vi.mock('../src/repositories/sessions.js', () => ({
  sessionRepository: {
    findByToken: mockFindSessionByToken,
    create: vi.fn(),
    deleteExpired: vi.fn(),
    deleteAllForUser: vi.fn(),
  },
}));

// Do NOT mock the catalog module - use real implementations with mocked dependencies

function resetMocks() {
  vi.clearAllMocks();
  fakeDb.select.mockReturnValue(selectChain);
  fakeDb.from.mockReturnValue(selectChain);
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.limit.mockReturnValue(selectChain);
  selectChain.returning.mockReturnValue(selectChain);
  selectChain.innerJoin.mockReturnValue(selectChain);
  selectChain.orderBy.mockReturnValue(selectChain);
  selectChain.offset.mockReturnValue(selectChain);

  fakeDb.insert.mockReturnValue(insertChain);
  insertChain.values.mockReturnValue(insertChain);
  insertChain.returning.mockReturnValue(insertChain);
  insertChain.onConflictDoUpdate.mockReturnValue(insertChain);
  insertChain.set.mockReturnValue(insertChain);
  insertChain.where.mockReturnValue(insertChain);
}

describe('Asset catalog search', () => {
  beforeEach(() => {
    resetMocks();
    mockGetCachedQuote.mockReset();
    mockGetUserOverride.mockReset();
    mockGetBrlPrice.mockReset();
    mockSetUserOverride.mockReset();
    mockGetAssetDetail.mockReset();
    mockFindSessionByToken.mockReset();
    mockAssetExistsQuery.mockReset();
  });

  it('partial match on symbol', async () => {
    const mockAsset = {
      id: 'asset-1',
      symbol: 'PETR4',
      name: 'Petrobras PN',
      class: 'acao' as const,
      sector: 'Petróleo e Gás',
      currency: 'BRL',
      providerKey: 'PETR4',
      isin: 'BRPETRACNPR6',
      createdAt: new Date(),
    };

    // Data query chain
    selectChain.orderBy.mockReturnValueOnce(selectChain);
    selectChain.limit.mockReturnValueOnce(selectChain);
    selectChain.offset.mockResolvedValueOnce([mockAsset]);

    // Count query: first where() returns thenable with count
    let whereCallCount = 0;
    selectChain.where.mockImplementation(() => {
      whereCallCount++;
      if (whereCallCount === 1) {
        return Promise.resolve([{ count: 1 }]);
      }
      // Data query where() returns the chain
      return selectChain;
    });

    const result = await searchAssets({ search: 'PETR' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.symbol).toBe('PETR4');
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('partial match on name (case-insensitive)', async () => {
    const mockAsset = {
      id: 'asset-1',
      symbol: 'PETR4',
      name: 'Petrobras PN',
      class: 'acao' as const,
      sector: 'Petróleo e Gás',
      currency: 'BRL',
      providerKey: 'PETR4',
      isin: 'BRPETRACNPR6',
      createdAt: new Date(),
    };

    selectChain.orderBy.mockReturnValueOnce(selectChain);
    selectChain.limit.mockReturnValueOnce(selectChain);
    selectChain.offset.mockResolvedValueOnce([mockAsset]);

    let whereCallCount = 0;
    selectChain.where.mockImplementation(() => {
      whereCallCount++;
      if (whereCallCount === 1) {
        return Promise.resolve([{ count: 1 }]);
      }
      return selectChain;
    });

    const result = await searchAssets({ search: 'petrobras' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.symbol).toBe('PETR4');
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('filters by asset class', async () => {
    const mockAssets = [
      { id: 'asset-1', symbol: 'HGLG11', name: 'CSHG Logística', class: 'fii' as const, sector: 'Logística', currency: 'BRL', providerKey: 'HGLG11', isin: 'BRHGLGCT0003', createdAt: new Date() },
      { id: 'asset-2', symbol: 'XPLG11', name: 'XP Logística', class: 'fii' as const, sector: 'Logística', currency: 'BRL', providerKey: 'XPLG11', isin: 'BRXPLGCT0007', createdAt: new Date() },
    ];

    selectChain.orderBy.mockReturnValueOnce(selectChain);
    selectChain.limit.mockReturnValueOnce(selectChain);
    selectChain.offset.mockResolvedValueOnce(mockAssets);

    let whereCallCount = 0;
    selectChain.where.mockImplementation(() => {
      whereCallCount++;
      if (whereCallCount === 1) {
        return Promise.resolve([{ count: 2 }]);
      }
      return selectChain;
    });

    const result = await searchAssets({ class: 'fii' });

    expect(result.items).toHaveLength(2);
    expect(result.items.every(a => a.class === 'fii')).toBe(true);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
  });

  it('filters by currency', async () => {
    const mockAsset = {
      id: 'asset-1', symbol: 'IVVB11', name: 'iShares S&P 500', class: 'etf' as const, sector: 'Índice Internacional', currency: 'BRL', providerKey: 'IVVB11', isin: 'BRIVVBCTF003', createdAt: new Date(),
    };

    selectChain.orderBy.mockReturnValueOnce(selectChain);
    selectChain.limit.mockReturnValueOnce(selectChain);
    selectChain.offset.mockResolvedValueOnce([mockAsset]);

    let whereCallCount = 0;
    selectChain.where.mockImplementation(() => {
      whereCallCount++;
      if (whereCallCount === 1) {
        return Promise.resolve([{ count: 1 }]);
      }
      return selectChain;
    });

    const result = await searchAssets({ currency: 'BRL' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.currency).toBe('BRL');
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('pagination works correctly', async () => {
    const mockAssets = Array.from({ length: 20 }, (_, i) => ({
      id: `asset-${i}`,
      symbol: `SYM${i}`,
      name: `Symbol ${i}`,
      class: 'acao' as const,
      sector: 'Test',
      currency: 'BRL',
      providerKey: `SYM${i}`,
      isin: null,
      createdAt: new Date(),
    }));

    selectChain.orderBy.mockReturnValueOnce(selectChain);
    selectChain.limit.mockReturnValueOnce(selectChain);
    selectChain.offset.mockResolvedValueOnce(mockAssets);

    let whereCallCount = 0;
    selectChain.where.mockImplementation(() => {
      whereCallCount++;
      if (whereCallCount === 1) {
        return Promise.resolve([{ count: 25 }]);
      }
      return selectChain;
    });

    const result = await searchAssets({ page: 2, pageSize: 20 });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(2);
    expect(result.items).toHaveLength(20);
  });

  it('returns empty when no matches', async () => {
    selectChain.orderBy.mockReturnValueOnce(selectChain);
    selectChain.limit.mockReturnValueOnce(selectChain);
    selectChain.offset.mockResolvedValueOnce([]);

    let whereCallCount = 0;
    selectChain.where.mockImplementation(() => {
      whereCallCount++;
      if (whereCallCount === 1) {
        return Promise.resolve([{ count: 0 }]);
      }
      return selectChain;
    });

    const result = await searchAssets({ search: 'NONEXISTENT' });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });
});

describe('Trending assets', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('returns curated list of top assets', async () => {
    const trendingAssets = [
      { id: '1', symbol: 'PETR4', name: 'Petrobras PN', class: 'acao' as const, sector: 'Petróleo e Gás', currency: 'BRL', providerKey: 'PETR4', isin: 'BRPETRACNPR6', createdAt: new Date() },
      { id: '2', symbol: 'VALE3', name: 'Vale', class: 'acao' as const, sector: 'Mineração', currency: 'BRL', providerKey: 'VALE3', isin: 'BRVALEACNOR0', createdAt: new Date() },
      { id: '3', symbol: 'HGLG11', name: 'CSHG Logística', class: 'fii' as const, sector: 'Logística', currency: 'BRL', providerKey: 'HGLG11', isin: 'BRHGLGCT0003', createdAt: new Date() },
      { id: '4', symbol: 'BOVA11', name: 'iShares Ibovespa', class: 'etf' as const, sector: 'Índice', currency: 'BRL', providerKey: 'BOVA11', isin: 'BRBOVACTF006', createdAt: new Date() },
    ];

    selectChain.limit.mockResolvedValueOnce(trendingAssets);

    const result = await getTrendingAssets(4);

    expect(result).toHaveLength(4);
    expect(result.map(a => a.symbol)).toEqual(['PETR4', 'VALE3', 'HGLG11', 'BOVA11']);
  });
});

describe('Asset detail', () => {
  beforeEach(() => {
    resetMocks();
    mockGetCachedQuote.mockReset();
    mockGetUserOverride.mockReset();
    mockGetBrlPrice.mockReset();
    mockGetAssetDetail.mockReset();
    mockFindSessionByToken.mockReset();
    mockAssetExistsQuery.mockReset();
  });

  it('returns null for unknown symbol', async () => {
    selectChain.limit.mockResolvedValueOnce([]);

    const result = await getAssetDetail('UNKNOWN');

    expect(result).toBeNull();
  });

  it('returns asset with last quote and user override', async () => {
    const asset = {
      id: 'asset-1',
      symbol: 'PETR4',
      name: 'Petrobras PN',
      class: 'acao' as const,
      sector: 'Petróleo e Gás',
      currency: 'BRL',
      providerKey: 'PETR4',
      isin: 'BRPETRACNPR6',
      createdAt: new Date(),
    };

    const cachedQuote = {
      quote: { priceCents: 3000n, currency: 'BRL', source: 'brapi', fxRateToBRL: null, isStale: false, fetchedAt: new Date(), validUntil: new Date(Date.now() + 15 * 60 * 1000) },
      asset,
      isFresh: true,
      isStale: false,
      isExpired: false,
    };

    const userOverride = {
      id: 'override-1',
      userId: 'user-1',
      assetId: 'asset-1',
      priceCents: 3500n,
      currency: 'BRL',
      createdAt: new Date(),
    };

    // Mock asset lookup - select().from(assets).where(...).limit(1)
    selectChain.limit.mockResolvedValueOnce([asset]);

    // Mock dependent services
    mockGetCachedQuote.mockResolvedValue(cachedQuote);
    mockGetUserOverride.mockResolvedValue(userOverride);
    mockGetBrlPrice.mockResolvedValue({
      priceCentsBRL: 3000n,
      currency: 'BRL',
      fxRateUsed: null,
      isStale: false,
      fxUnavailable: false,
    });

    const result = await getAssetDetail('PETR4', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.asset.symbol).toBe('PETR4');
    expect(result!.lastQuote).not.toBeNull();
    expect(result!.lastQuote!.priceCentsBRL).toBe(3000n);
    expect(result!.lastQuote!.fxRateUsed).toBeNull();
    expect(result!.lastQuote!.isStale).toBe(false);
    expect(result!.userOverride).not.toBeNull();
    expect(result!.userOverride!.priceCents).toBe(3500n);
  });
});

describe('Override on non-catalog asset (integration via route)', () => {
  beforeEach(() => {
    resetMocks();
    mockGetAssetDetail.mockReset();
    mockFindSessionByToken.mockReset();
    mockAssetExistsQuery.mockReset();
  });

  it('returns 400 for asset not in catalog', async () => {
    // Mock getAssetDetail to return null (asset not found in catalog)
    mockGetAssetDetail.mockResolvedValue(null);

    // Mock session for auth
    mockFindSessionByToken.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    });

    // Mock the asset existence check DB query in the route handler
    // select({ id: assets.id }).from(assets).where(eq(assets.symbol, symbol.toUpperCase())).limit(1)
    const assetCheckChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // Empty = asset not found
      returning: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
    };
    // Override the select to return our asset check chain for this specific call
    fakeDb.select.mockImplementationOnce(() => assetCheckChain);

    const token = createSessionToken('user-1', Date.now() + 86400000);

    const res = await app.request('/api/v1/assets/UNKNOWN/override', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${token}`,
      },
      body: JSON.stringify({ priceCents: 3500, currency: 'BRL' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('Asset seeding', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('seeds common Brazilian assets idempotently', async () => {
    insertChain.onConflictDoUpdate.mockReturnValue(insertChain);
    insertChain.returning.mockResolvedValue([{ id: 'new-id' }]);

    const count = await seedAssetCatalog();

    expect(count).toBeGreaterThan(30);
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
  });
});