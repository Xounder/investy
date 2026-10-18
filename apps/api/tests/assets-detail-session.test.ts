/**
 * GET /api/v1/assets/:symbol session resolution through the production app
 * (TASK-04 QA correction).
 *
 * The pre-existing coverage mounted the assets router behind a custom
 * `authedApp`, which masked the real defect: the production app
 * (src/app.ts) never resolved the optional session on this route, because
 * `requireUser(c)` threw and the error was swallowed, leaving userId null.
 * These tests exercise the exact request path users hit — the exported
 * production app — with a real session cookie, and assert the user's price
 * override is returned. Only the external boundaries are faked: the
 * database client and the session repository read by the auth middleware.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import app from '../src/app.js';
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

const OVERRIDE_ROW: FakeRow = {
  id: 'override-1',
  userId: 'user-1',
  assetId: 'asset-petr4',
  priceCents: 4000n,
  currency: 'BRL',
  createdAt: new Date('2024-06-02T09:00:00.000Z'),
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

function queueDetail(): void {
  fakeDb.queueResults(assets, [PETR4_ASSET]);
  fakeDb.queueResults(quotes, [
    { quote: quoteRow('asset-petr4', 3812n), asset: PETR4_ASSET },
  ]);
}

function overrideSelects() {
  return fakeDb
    .getWhereCaptures()
    .filter((capture) => capture.table === quoteOverrides && capture.method === 'select');
}

type AssetDetailBody = {
  asset: { symbol: string };
  lastQuote: { priceCents: string } | null;
  userOverride: { priceCents: string; currency: string; createdAt: string } | null;
};

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
  mockFindByToken.mockResolvedValue(null);
});

describe('GET /api/v1/assets/:symbol through the production app (src/app.ts)', () => {
  it('returns the user override when a valid session cookie is sent', async () => {
    const token = createSessionToken('user-1');
    mockFindByToken.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      token,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    });

    queueDetail();
    fakeDb.queueResults(quoteOverrides, [OVERRIDE_ROW]);

    const res = await app.request('/api/v1/assets/PETR4', {
      headers: { Cookie: `session=${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssetDetailBody;

    // The optional auth middleware actually resolved the session cookie.
    expect(mockFindByToken).toHaveBeenCalledWith(token);

    expect(body.asset.symbol).toBe('PETR4');
    expect(body.lastQuote?.priceCents).toBe('3812');
    expect(body.userOverride).toEqual({
      priceCents: '4000',
      currency: 'BRL',
      createdAt: '2024-06-02T09:00:00.000Z',
    });

    // The override lookup is scoped to the session user (ADR-006).
    const selects = overrideSelects();
    expect(selects).toHaveLength(1);
    expect(whereFacts(selects[0]?.where)).toEqual({
      columns: ['user_id', 'asset_id'],
      values: ['user-1', 'asset-petr4'],
    });
  });

  it('serves anonymous requests without touching the override table', async () => {
    queueDetail();

    const res = await app.request('/api/v1/assets/PETR4');
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssetDetailBody;

    expect(mockFindByToken).not.toHaveBeenCalled();
    expect(body.lastQuote?.priceCents).toBe('3812');
    expect(body.userOverride).toBeNull();
    expect(overrideSelects()).toHaveLength(0);
  });

  it('falls back to the anonymous response when the session is revoked', async () => {
    const token = createSessionToken('user-1');
    mockFindByToken.mockResolvedValue(null); // revoked or unknown session

    queueDetail();

    const res = await app.request('/api/v1/assets/PETR4', {
      headers: { Cookie: `session=${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssetDetailBody;

    expect(mockFindByToken).toHaveBeenCalledWith(token);
    expect(body.userOverride).toBeNull();
    expect(overrideSelects()).toHaveLength(0);
  });
});
