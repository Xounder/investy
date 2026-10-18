/**
 * Market route integration coverage (TASK-04).
 *
 * Exercises the real routes, the real market-data services (cache, fx,
 * catalog, overrides) and the real provider registry. Only the external
 * boundaries are faked: the database client, the session repository and the
 * rate-limited provider HTTP calls.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

import app from '../src/app.js';
import marketRoutes from '../src/routes/market.js';
import { authMiddleware } from '../src/middleware/auth.js';
import { createSessionToken } from '../src/lib/session.js';
import {
  initializeProviders,
  resetProvidersInitialized,
} from '../src/services/market-data/index.js';
import { assets, benchmarkSeries, quoteOverrides, quotes } from '../src/db/schema.js';
import { createFakeDb, type FakeDb, type FakeRow } from './helpers/fake-db.js';
import {
  PETR4_ASSET,
  VALE3_ASSET,
  benchmarkRow,
  quoteRow,
} from './helpers/market-fixtures.js';
import { whereFacts } from './helpers/sql-facts.js';

const {
  dbHolder,
  mockFindByToken,
  mockBrapiFetch,
  mockBcbFetch,
  mockYahooFetch,
  mockCoingeckoFetch,
} = vi.hoisted(() => ({
  dbHolder: { current: null as unknown },
  mockFindByToken: vi.fn(),
  mockBrapiFetch: vi.fn(),
  mockBcbFetch: vi.fn(),
  mockYahooFetch: vi.fn(),
  mockCoingeckoFetch: vi.fn(),
}));

vi.mock('../src/db/client.js', () => ({
  getDb: () => dbHolder.current,
}));

vi.mock('../src/repositories/sessions.js', () => ({
  sessionRepository: {
    findByToken: mockFindByToken,
    create: vi.fn(),
    deleteExpired: vi.fn(),
    deleteAllForUser: vi.fn(),
  },
}));

vi.mock('../src/services/market-data/rate-limited-providers.js', () => ({
  getLimitedBrapiProvider: vi.fn(() =>
    Promise.resolve({
      name: 'brapi',
      fetchQuote: mockBrapiFetch,
      supports: vi.fn().mockReturnValue(true),
    }),
  ),
  getLimitedBcbSgsProvider: vi.fn(() =>
    Promise.resolve({
      name: 'bcb',
      fetchQuote: mockBcbFetch,
      supports: vi.fn().mockReturnValue(true),
    }),
  ),
  getLimitedYahooProvider: vi.fn(() =>
    Promise.resolve({
      name: 'yahoo',
      fetchQuote: mockYahooFetch,
      supports: vi.fn().mockReturnValue(true),
    }),
  ),
  getLimitedCoingeckoProvider: vi.fn(() =>
    Promise.resolve({
      name: 'coingecko',
      fetchQuote: mockCoingeckoFetch,
      supports: vi.fn().mockReturnValue(true),
    }),
  ),
  resetRateLimitedProviders: vi.fn(),
}));

const fakeDb: FakeDb = createFakeDb();
dbHolder.current = fakeDb;

const authedApp = new Hono();
authedApp.use('*', authMiddleware);
authedApp.route('/api/v1/market', marketRoutes);

type QuotesBody = {
  quotes: Array<{
    symbol: string;
    name: string;
    class: string;
    priceCents: string;
    currency: string;
    priceCentsBRL: string;
    fxRateUsed: number | null;
    fxUnavailable?: boolean;
    source: string;
    fetchedAt: string;
    isStale: boolean;
    override: { priceCents: string; currency: string } | null;
  }>;
  stale: string[];
  overrides: Array<{ symbol: string; priceCents: string; currency: string; createdAt: string }>;
  missing: string[];
};

beforeEach(async () => {
  fakeDb.reset();
  vi.clearAllMocks();
  mockFindByToken.mockResolvedValue(null);
  mockBrapiFetch.mockResolvedValue(null);
  mockBcbFetch.mockResolvedValue(null);
  mockYahooFetch.mockResolvedValue(null);
  mockCoingeckoFetch.mockResolvedValue(null);
  resetProvidersInitialized();
  await initializeProviders();
});

describe('GET /api/v1/market/quotes (real services)', () => {
  it('caps requests at 50 symbols', async () => {
    const symbols = Array.from({ length: 51 }, (_, i) => `SYM${i}`).join(',');
    const res = await app.request(`/api/v1/market/quotes?symbols=${symbols}`);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION');
    expect(fakeDb.getWhereCaptures()).toHaveLength(0);
  });

  it('rejects requests without the symbols parameter', async () => {
    const res = await app.request('/api/v1/market/quotes');

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION');
  });

  it('serves cached BRL quotes without hitting providers', async () => {
    const quote = quoteRow({ assetId: 'asset-petr4', priceCents: 3812n });
    fakeDb.queueResults(
      assets,
      [PETR4_ASSET],
      [PETR4_ASSET],
    );
    fakeDb.queueResults(quotes, [{ quote, asset: PETR4_ASSET }]);

    const res = await app.request('/api/v1/market/quotes?symbols=PETR4');
    expect(res.status).toBe(200);
    const body = (await res.json()) as QuotesBody;

    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0]).toMatchObject({
      symbol: 'PETR4',
      name: 'Petroleo Brasileiro SA - Petrobras PN',
      class: 'acao',
      priceCents: '3812',
      currency: 'BRL',
      priceCentsBRL: '3812',
      fxRateUsed: null,
      source: 'brapi',
      isStale: false,
      override: null,
    });
    expect(body.quotes[0]?.fetchedAt).toBe('2024-06-01T12:00:00.000Z');
    expect(body.stale).toEqual([]);
    expect(body.missing).toEqual([]);
    expect(body.overrides).toEqual([]);
    expect(mockBrapiFetch).not.toHaveBeenCalled();
    expect(fakeDb.getInsertPayloads()).toHaveLength(0);
  });

  it('flags expired quotes as stale and attempts hydration', async () => {
    const quote = quoteRow({
      assetId: 'asset-vale3',
      priceCents: 6550n,
      isStale: true,
      validUntil: new Date(Date.now() - 60 * 60 * 1000),
    });
    fakeDb.queueResults(assets, [VALE3_ASSET], [VALE3_ASSET], [VALE3_ASSET]);
    fakeDb.queueResults(quotes, [{ quote, asset: VALE3_ASSET }]);

    const res = await app.request('/api/v1/market/quotes?symbols=VALE3');
    expect(res.status).toBe(200);
    const body = (await res.json()) as QuotesBody;

    expect(body.stale).toEqual(['VALE3']);
    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0]?.isStale).toBe(true);
    expect(body.quotes[0]?.priceCents).toBe('6550');
    expect(mockBrapiFetch).toHaveBeenCalledWith('VALE3', 'acao');
    expect(fakeDb.getInsertPayloads()).toHaveLength(0);
  });

  it('reports unknown symbols as missing', async () => {
    fakeDb.queueResults(assets, [], []);

    const res = await app.request('/api/v1/market/quotes?symbols=NONEXISTENT');
    expect(res.status).toBe(200);
    const body = (await res.json()) as QuotesBody;

    expect(body.quotes).toEqual([]);
    expect(body.missing).toEqual(['NONEXISTENT']);
    expect(body.stale).toEqual([]);
  });

  it('resolves user overrides for an authenticated request', async () => {
    const token = createSessionToken('user-1');
    mockFindByToken.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    });

    const quote = quoteRow({ assetId: 'asset-petr4', priceCents: 3812n });
    const override: FakeRow = {
      id: 'override-1',
      userId: 'user-1',
      assetId: 'asset-petr4',
      priceCents: 4000n,
      currency: 'BRL',
      createdAt: new Date('2024-06-02T09:00:00.000Z'),
    };
    const joined = [{ quote, asset: PETR4_ASSET }];

    fakeDb.queueResults(
      assets,
      [PETR4_ASSET],
      [PETR4_ASSET],
      [PETR4_ASSET],
      [PETR4_ASSET],
    );
    fakeDb.queueResults(quotes, joined, joined, joined);
    fakeDb.queueResults(quoteOverrides, [override], [override]);

    const res = await authedApp.request('/api/v1/market/quotes?symbols=PETR4', {
      headers: { Cookie: `session=${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as QuotesBody;

    expect(mockFindByToken).toHaveBeenCalledWith(token);
    expect(body.quotes[0]?.override).toEqual({ priceCents: '4000', currency: 'BRL' });
    expect(body.overrides).toHaveLength(1);
    expect(body.overrides[0]).toMatchObject({
      symbol: 'PETR4',
      priceCents: '4000',
      currency: 'BRL',
    });
    expect(body.overrides[0]?.createdAt).toBe('2024-06-02T09:00:00.000Z');

    const overrideCaptures = fakeDb
      .getWhereCaptures()
      .filter((capture) => capture.table === quoteOverrides);
    expect(overrideCaptures.length).toBeGreaterThan(0);
    for (const cap of overrideCaptures) {
      const f = whereFacts(cap.where);
      expect(f.columns).toContain('user_id');
      expect(f.values).toContain('user-1');
      expect(f.columns).toContain('asset_id');
      expect(f.values).toContain('asset-petr4');
    }
  });

  it('keeps per-table result isolation for every query in the chain', async () => {
    const quote = quoteRow({ assetId: 'asset-petr4', priceCents: 3812n });
    fakeDb.queueResults(assets, [PETR4_ASSET], [PETR4_ASSET]);
    fakeDb.queueResults(quotes, [{ quote, asset: PETR4_ASSET }]);
    fakeDb.queueResults(benchmarkSeries, [benchmarkRow('CDI', '2024-06-01T00:00:00.000Z', 1175n)]);

    await app.request('/api/v1/market/quotes?symbols=PETR4');

    const capturedTables = fakeDb.getWhereCaptures().map((capture) => capture.table);
    expect(capturedTables).toContain(assets);
    expect(capturedTables).toContain(quotes);
    expect(capturedTables).not.toContain(benchmarkSeries);
    expect(fakeDb.getSelectFields()[0]).toMatchObject({
      symbol: assets.symbol,
      class: assets.class,
      id: assets.id,
    });
  });
});

describe('GET /api/v1/market/benchmarks (real services)', () => {
  it('groups the series by symbol', async () => {
    fakeDb.queueResults(benchmarkSeries, [
      benchmarkRow('CDI', '2024-02-01T00:00:00.000Z', 1175n),
      benchmarkRow('CDI', '2024-01-01T00:00:00.000Z', 1170n),
      benchmarkRow('IBOV', '2024-02-01T00:00:00.000Z', 130_000n),
      benchmarkRow('IBOV', '2024-01-01T00:00:00.000Z', 129_500n),
    ]);

    const res = await app.request('/api/v1/market/benchmarks?series=cdi,ibov');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      benchmarks: Array<{ symbol: string; series: Array<{ date: string; value: number }> }>;
    };

    expect(body.benchmarks.map((entry) => entry.symbol)).toEqual(['CDI', 'IBOV']);
    expect(body.benchmarks[0]?.series).toEqual([
      { date: '2024-02-01T00:00:00.000Z', value: 1175 },
      { date: '2024-01-01T00:00:00.000Z', value: 1170 },
    ]);
    expect(body.benchmarks[1]?.series).toEqual([
      { date: '2024-02-01T00:00:00.000Z', value: 130000 },
      { date: '2024-01-01T00:00:00.000Z', value: 129500 },
    ]);
  });

  it('returns the default series when the parameter is omitted', async () => {
    const res = await app.request('/api/v1/market/benchmarks');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      benchmarks: Array<{ symbol: string; series: unknown[] }>;
    };

    expect(body.benchmarks.map((entry) => entry.symbol)).toEqual([
      'CDI',
      'IBOV',
      'IFIX',
      'SELIC',
      'IPCA',
    ]);
    expect(body.benchmarks.every((entry) => entry.series.length === 0)).toBe(true);
    expect(
      fakeDb
        .getWhereCaptures()
        .some((capture) => capture.table === benchmarkSeries && capture.method === 'select'),
    ).toBe(true);
  });
});

describe('GET /api/v1/market/indicators (real services)', () => {
  it('returns the latest indicator values with the fetch time', async () => {
    fakeDb.queueResults(benchmarkSeries, [
      benchmarkRow('SELIC', '2024-02-01T00:00:00.000Z', 1175n),
      benchmarkRow('CDI', '2024-02-01T00:00:00.000Z', 1170n),
      benchmarkRow('IPCA', '2024-02-01T00:00:00.000Z', 45n),
      benchmarkRow('IBOV', '2024-02-01T00:00:00.000Z', 130_000n),
      benchmarkRow('IFIX', '2024-02-01T00:00:00.000Z', 300_000n),
    ]);

    const before = Date.now();
    const res = await app.request('/api/v1/market/indicators');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      indicators: Array<{ symbol: string; value: number; date: string }>;
      fetchedAt: string;
    };

    expect(body.indicators).toEqual([
      { symbol: 'SELIC', value: 1175, date: '2024-02-01T00:00:00.000Z' },
      { symbol: 'CDI', value: 1170, date: '2024-02-01T00:00:00.000Z' },
      { symbol: 'IPCA', value: 45, date: '2024-02-01T00:00:00.000Z' },
      { symbol: 'IBOV', value: 130000, date: '2024-02-01T00:00:00.000Z' },
      { symbol: 'IFIX', value: 300000, date: '2024-02-01T00:00:00.000Z' },
    ]);
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
    expect(Date.parse(body.fetchedAt)).toBeGreaterThanOrEqual(before);
  });

  it('returns an empty indicator list when no series data exists', async () => {
    const res = await app.request('/api/v1/market/indicators');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { indicators: unknown[]; fetchedAt: string };

    expect(body.indicators).toEqual([]);
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
  });
});