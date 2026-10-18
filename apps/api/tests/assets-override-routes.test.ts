/**
 * Asset override route integration coverage (TASK-04 split).
 *
 * Exercises PATCH/DELETE override endpoints with the real services. Only external
 * boundaries are faked: the database client and the session repository. Tests
 * assert route output and captured database side effects.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

import app from '../src/app.js';
import assetRoutes from '../src/routes/assets.js';
import { authMiddleware } from '../src/middleware/auth.js';
import { createSessionToken } from '../src/lib/session.js';
import { assets, quoteOverrides } from '../src/db/schema.js';
import { createFakeDb, type FakeDb, type FakeRow } from './helpers/fake-db.js';
import { PETR4_ASSET } from './helpers/market-fixtures.js';
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

describe('PATCH /api/v1/assets/:symbol/override (real setUserOverride)', () => {
  it('returns 400 when the symbol is not in the catalog', async () => {
    const cookie = sessionCookie('user-1');
    fakeDb.queueResults(assets, []);

    const res = await app.request('/api/v1/assets/UNKNOWN9/override', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceCents: 4000, currency: 'BRL' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(fakeDb.getInsertPayloads()).toHaveLength(0);
    expect(capturesFor(quoteOverrides, 'select')).toHaveLength(0);
  });

  it('persists the upsert through the real overrides service', async () => {
    const cookie = sessionCookie('user-1');
    const returning: FakeRow = {
      id: 'override-1',
      userId: 'user-1',
      assetId: 'asset-petr4',
      priceCents: 4000n,
      currency: 'BRL',
      createdAt: new Date('2024-06-02T09:00:00.000Z'),
    };
    fakeDb.queueResults(assets, [PETR4_ASSET], [PETR4_ASSET]);
    fakeDb.queueResults(quoteOverrides, [returning]);

    const res = await app.request('/api/v1/assets/petr4/override', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceCents: 4000 }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      symbol: 'PETR4',
      priceCents: '4000',
      currency: 'BRL',
      createdAt: '2024-06-02T09:00:00.000Z',
    });

    const inserts = fakeDb.getInsertPayloads();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(quoteOverrides);

    const values = inserts[0]?.values as {
      id: string;
      userId: string;
      assetId: string;
      priceCents: bigint;
      currency: string;
      createdAt: Date;
    };
    expect(typeof values.id).toBe('string');
    expect(values.userId).toBe('user-1');
    expect(values.assetId).toBe('asset-petr4');
    expect(values.priceCents).toBe(4000n);
    expect(values.currency).toBe('BRL');
    expect(values.createdAt).toBeInstanceOf(Date);

    const assetSelects = capturesFor(assets, 'select');
    expect(assetSelects).toHaveLength(2);
    const assetFacts = whereFacts(assetSelects[1]?.where);
    expect(assetFacts.columns).toContain('id');
    expect(assetFacts.values).toContain('asset-petr4');

    // The upsert is the write-path scoping boundary: its conflict target must
    // be the (user, asset) pair, otherwise the row of another user sharing the
    // asset would be overwritten instead of a new per-user row being written.
    const upserts = fakeDb
      .getConflictTargets()
      .filter((capture) => capture.table === quoteOverrides);
    expect(upserts).toHaveLength(1);
    const upsertScope = whereFacts(upserts[0]?.target);
    expect(upsertScope.columns).toEqual(
      expect.arrayContaining(['user_id', 'asset_id']),
    );
  });
});

describe('DELETE /api/v1/assets/:symbol/override (real clearUserOverride)', () => {
  it('returns 404 when the asset is not in the catalog', async () => {
    const cookie = sessionCookie('user-1');
    fakeDb.queueResults(assets, []);

    const res = await app.request('/api/v1/assets/UNKNOWN9/override', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(fakeDb.getDeleteCaptures()).toHaveLength(0);
  });

  it('deletes the row and reports success', async () => {
    const cookie = sessionCookie('user-1');
    fakeDb.queueResults(assets, [PETR4_ASSET]);
    fakeDb.queueResults(quoteOverrides, [{ id: 'override-1' }]);

    const res = await app.request('/api/v1/assets/PETR4/override', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const deletes = fakeDb.getDeleteCaptures();
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.table).toBe(quoteOverrides);
    const deleteFacts = whereFacts(deletes[0]?.where);
    expect(deleteFacts.columns).toContain('user_id');
    expect(deleteFacts.columns).toContain('asset_id');
    expect(deleteFacts.values).toContain('user-1');
    expect(deleteFacts.values).toContain('asset-petr4');
  });

  it('returns 404 when no override row was deleted', async () => {
    const cookie = sessionCookie('user-1');
    fakeDb.queueResults(assets, [PETR4_ASSET]);
    fakeDb.queueResults(quoteOverrides, []);

    const res = await app.request('/api/v1/assets/PETR4/override', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('No override found for this asset');
  });
});

/**
 * ADR-006: every override read is bound to the authenticated user.
 *
 * The fake database returns queued rows without evaluating SQL predicates, so
 * row-level filtering cannot be observed here. The cross-user guarantee is
 * instead asserted on the generated predicate itself: the read must always be
 * pinned to the session user's id and the requested asset, so a row owned by
 * another user is unreachable. Dropping the `user_id` predicate from
 * `getUserOverride` makes these assertions fail.
 */
describe('ADR-006: cross-user override isolation', () => {
  type AssetDetailBody = {
    userOverride: { priceCents: string; currency: string; createdAt: string } | null;
  };

  async function fetchDetail(
    userId: string,
    overrides: FakeRow[][],
  ): Promise<AssetDetailBody> {
    const cookie = sessionCookie(userId);
    fakeDb.queueResults(assets, [PETR4_ASSET], [PETR4_ASSET]);
    fakeDb.queueResults(quoteOverrides, ...overrides);

    const res = await authedApp.request('/api/v1/assets/PETR4', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    return (await res.json()) as AssetDetailBody;
  }

  function expectScopedOverrideReads(userId: string, assetId: string): void {
    const selects = capturesFor(quoteOverrides, 'select');
    expect(selects.length).toBeGreaterThan(0);
    for (const cap of selects) {
      const facts = whereFacts(cap.where);
      expect(facts.columns).toEqual(expect.arrayContaining(['user_id', 'asset_id']));
      expect(facts.values).toContain(userId);
      expect(facts.values).toContain(assetId);
    }
  }

  it('binds the override read to the session user, not to another user', async () => {
    const otherUserOverride: FakeRow = {
      id: 'override-other',
      userId: 'user-2',
      assetId: 'asset-petr4',
      priceCents: 5000n,
      currency: 'BRL',
      createdAt: new Date('2024-06-03T09:00:00.000Z'),
    };

    const body = await fetchDetail('user-1', [[otherUserOverride]]);

    // The read is issued for user-1 only: no capture may reference user-2.
    expectScopedOverrideReads('user-1', 'asset-petr4');
    expect(body.userOverride).toEqual({
      priceCents: '5000',
      currency: 'BRL',
      createdAt: '2024-06-03T09:00:00.000Z',
    });
  });

  it('scopes each user to their own override row', async () => {
    const own: FakeRow = {
      id: 'override-u1',
      userId: 'user-1',
      assetId: 'asset-petr4',
      priceCents: 4000n,
      currency: 'BRL',
      createdAt: new Date('2024-06-03T09:00:00.000Z'),
    };
    const other: FakeRow = {
      id: 'override-u2',
      userId: 'user-2',
      assetId: 'asset-petr4',
      priceCents: 5000n,
      currency: 'BRL',
      createdAt: new Date('2024-06-04T09:00:00.000Z'),
    };

    const userOneBody = await fetchDetail('user-1', [[own]]);
    expectScopedOverrideReads('user-1', 'asset-petr4');
    expect(userOneBody.userOverride?.priceCents).toBe('4000');

    fakeDb.reset();
    const userTwoBody = await fetchDetail('user-2', [[other]]);
    expectScopedOverrideReads('user-2', 'asset-petr4');
    expect(userTwoBody.userOverride?.priceCents).toBe('5000');
  });

  it('returns no override when the scoped read finds no row', async () => {
    const body = await fetchDetail('user-1', [[]]);

    expectScopedOverrideReads('user-1', 'asset-petr4');
    expect(body.userOverride).toBeNull();
  });
});
