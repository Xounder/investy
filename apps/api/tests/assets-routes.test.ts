/**
 * Asset route integration coverage (TASK-04 split).
 *
 * Exercises catalog/search/trending/detail routes. Only external boundaries are
 * faked: the database client and the session repository read by the auth
 * middleware. Assertions observe route output and captured database side effects.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

import app from '../src/app.js';
import assetRoutes from '../src/routes/assets.js';
import { authMiddleware } from '../src/middleware/auth.js';
import { createSessionToken } from '../src/lib/session.js';
import { assets, quoteOverrides, quotes } from '../src/db/schema.js';
import { createFakeDb, type FakeDb, type FakeRow } from './helpers/fake-db.js';
import { whereFacts } from './helpers/sql-facts.js';

const { dbHolder, mockFindByToken } = vi.hoisted(() => ({
  dbHolder: { current: null as unknown },
  mockFindByToken: vi.fn(),
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

const fakeDb: FakeDb = createFakeDb();
dbHolder.current = fakeDb;

const authedApp = new Hono();
authedApp.use('*', authMiddleware);
authedApp.route('/api/v1/assets', assetRoutes);

const PETR4_ASSET: FakeRow = {
  id: 'asset-petr4',
  symbol: 'PETR4',
  name: 'Petroleo Brasileiro SA - Petrobras PN',
  class: 'acao',
  sector: 'Petroleo e Gas',
  currency: 'BRL',
  providerKey: 'PETR4',
  isin: 'BRPETRACNPR6',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const VALE3_ASSET: FakeRow = {
  id: 'asset-vale3',
  symbol: 'VALE3',
  name: 'Vale SA ON',
  class: 'acao',
  sector: 'Mineracao',
  currency: 'BRL',
  providerKey: 'VALE3',
  isin: 'BRVALEACNOR0',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const BBDC4_ASSET: FakeRow = {
  id: 'asset-bbdc4',
  symbol: 'BBDC4',
  name: 'Banco Bradesco SA PN',
  class: 'acao',
  sector: 'Bancos',
  currency: 'BRL',
  providerKey: 'BBDC4',
  isin: 'BRBBDCACNPR8',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const HGLG11_ASSET: FakeRow = {
  id: 'asset-hglg11',
  symbol: 'HGLG11',
  name: 'CSHG Logistica FII',
  class: 'fii',
  sector: 'Logistica',
  currency: 'BRL',
  providerKey: 'HGLG11',
  isin: 'BRHGLGCT0003',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const XPLG11_ASSET: FakeRow = {
  id: 'asset-xplg11',
  symbol: 'XPLG11',
  name: 'XP Logistica FII',
  class: 'fii',
  sector: 'Logistica',
  currency: 'BRL',
  providerKey: 'XPLG11',
  isin: 'BRXPLGCT0007',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

function quoteRow(assetId: string, priceCents: bigint): FakeRow {
  return {
    id: `quote-${assetId}`,
    assetId,
    priceCents,
    currency: 'BRL',
    fxRateToBRL: null,
    source: 'brapi',
    isStale: false,
    fetchedAt: new Date('2024-06-01T12:00:00.000Z'),
    validUntil: new Date(Date.now() + 60 * 60 * 1000),
  };
}

function sessionCookie(userId: string): string {
  const token = createSessionToken(userId);
  mockFindByToken.mockResolvedValue({
    id: `session-${userId}`,
    userId,
    token,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
  });
  return `session=${token}`;
}

function capturesFor(table: unknown, method: 'select' | 'update' | 'delete') {
  return fakeDb
    .getWhereCaptures()
    .filter((capture) => capture.table === table && capture.method === method);
}



beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
  mockFindByToken.mockResolvedValue(null);
});

describe('GET /api/v1/assets (real searchAssets)', () => {
  it('returns the paged shape and applies class and currency filters', async () => {
    fakeDb.queueResults(assets, [{ count: 2 }], [HGLG11_ASSET, XPLG11_ASSET]);

    const res = await app.request(
      '/api/v1/assets?search=hglg&class=fii&currency=brl&page=1&pageSize=5',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ symbol: string; class: string; currency: string }>;
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };

    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(5);
    expect(body.totalPages).toBe(1);
    expect(body.items.map((item) => item.symbol)).toEqual(['HGLG11', 'XPLG11']);
    expect(body.items[0]).toMatchObject({ class: 'fii', currency: 'BRL' });

    const selects = capturesFor(assets, 'select');
    expect(selects).toHaveLength(2);

    const countFacts = whereFacts(selects[0]?.where);
    expect(countFacts.columns).toEqual(['symbol', 'name', 'isin', 'class', 'currency']);
    expect(countFacts.values).toEqual(['%hglg%', '%hglg%', '%hglg%', 'fii', 'BRL']);

    const selectFields = fakeDb.getSelectFields();
    expect(selectFields).toHaveLength(1);
    expect(Object.keys(selectFields[0] as object)).toEqual(['count']);
  });

  it('returns an empty page when the catalog query matches nothing', async () => {
    fakeDb.queueResults(assets, [{ count: 0 }], []);

    const res = await app.request('/api/v1/assets?search=nonexistent');
    expect(res.status).toBe(200);

    expect(await res.json()).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    expect(capturesFor(assets, 'select')).toHaveLength(2);
  });

  it('rejects an unknown asset class before touching the database', async () => {
    const res = await app.request('/api/v1/assets?class=nao_existe');

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION');
    expect(fakeDb.getWhereCaptures()).toHaveLength(0);
  });
});

describe('GET /api/v1/assets/trending (real getTrendingAssets)', () => {
  it('returns the curated list and fills the remainder from the catalog', async () => {
    fakeDb.queueResults(
      assets,
      [PETR4_ASSET, VALE3_ASSET, HGLG11_ASSET],
      [BBDC4_ASSET],
    );

    const res = await app.request('/api/v1/assets/trending');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { assets: Array<{ symbol: string }> };

    expect(body.assets.map((asset) => asset.symbol)).toEqual([
      'PETR4',
      'VALE3',
      'HGLG11',
      'BBDC4',
    ]);
    expect(capturesFor(assets, 'select')).toHaveLength(2);
  });
});

describe('GET /api/v1/assets/:symbol (real getAssetDetail)', () => {
  it('returns 404 for a symbol outside the catalog', async () => {
    fakeDb.queueResults(assets, []);

    const res = await app.request('/api/v1/assets/UNKNOWN9');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('serializes the cached quote and skips the override lookup when anonymous', async () => {
    fakeDb.queueResults(assets, [PETR4_ASSET]);
    fakeDb.queueResults(quotes, [{ quote: quoteRow('asset-petr4', 3812n), asset: PETR4_ASSET }]);

    const res = await app.request('/api/v1/assets/petr4');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asset: { symbol: string; id: string };
      lastQuote: {
        priceCents: string;
        priceCentsBRL: string;
        source: string;
        isStale: boolean;
        fetchedAt: string;
      } | null;
      userOverride: unknown;
    };

    expect(body.asset).toMatchObject({ id: 'asset-petr4', symbol: 'PETR4' });
    expect(body.lastQuote).toMatchObject({
      priceCents: '3812',
      priceCentsBRL: '3812',
      source: 'brapi',
      isStale: false,
      fetchedAt: '2024-06-01T12:00:00.000Z',
    });
    expect(body.userOverride).toBeNull();

    const assetSelects = capturesFor(assets, 'select');
    expect(whereFacts(assetSelects[0]?.where)).toEqual({
      columns: ['symbol'],
      values: ['PETR4'],
    });
    expect(capturesFor(quotes, 'select')).toHaveLength(1);
    expect(capturesFor(quoteOverrides, 'select')).toHaveLength(0);
  });

  it('includes the user override for an authenticated request', async () => {
    const cookie = sessionCookie('user-1');
    const override: FakeRow = {
      id: 'override-1',
      userId: 'user-1',
      assetId: 'asset-petr4',
      priceCents: 4000n,
      currency: 'BRL',
      createdAt: new Date('2024-06-02T09:00:00.000Z'),
    };

    fakeDb.queueResults(assets, [PETR4_ASSET]);
    fakeDb.queueResults(quotes, [{ quote: quoteRow('asset-petr4', 3812n), asset: PETR4_ASSET }]);
    fakeDb.queueResults(quoteOverrides, [override]);

    const res = await authedApp.request('/api/v1/assets/PETR4', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lastQuote: { priceCents: string } | null;
      userOverride: { priceCents: string; currency: string; createdAt: string } | null;
    };

    expect(body.lastQuote?.priceCents).toBe('3812');
    expect(body.userOverride).toEqual({
      priceCents: '4000',
      currency: 'BRL',
      createdAt: '2024-06-02T09:00:00.000Z',
    });

    const overrideSelects = capturesFor(quoteOverrides, 'select');
    expect(overrideSelects).toHaveLength(1);
    expect(whereFacts(overrideSelects[0]?.where)).toEqual({
      columns: ['user_id', 'asset_id'],
      values: ['user-1', 'asset-petr4'],
    });
  });
});

