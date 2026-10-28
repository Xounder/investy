import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { isoDateTime, nonnegativeBigInt, uuidId } from '../src/lib/validation.js';

const { findSession, findAccount, append, update, remove } = vi.hoisted(() => ({
  findSession: vi.fn(), findAccount: vi.fn(), append: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));
vi.mock('../src/repositories/accounts.js', () => ({ accountRepository: { findById: findAccount } }));
vi.mock('../src/services/journal.js', async (loadOriginal) => {
  const actual = await loadOriginal<typeof import('../src/services/journal.js')>();
  return { ...actual, appendJournalEvent: append, updateJournalEvent: update, deleteJournalEvent: remove };
});

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tradeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const body = { type: 'buy', date: '2024-02-29', accountId, assetId, qty: 1, unitPriceCents: 100 };

function request(path: string, method: string, payload?: unknown) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: { Cookie: `session=${createSessionToken('alice')}`, 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  findAccount.mockResolvedValue({ id: accountId, portfolioId: tradeId });
  append.mockResolvedValue({ id: tradeId, qty: 1n });
  update.mockResolvedValue({ id: tradeId, qty: 1n });
});

describe('TASK-05 input and error contracts', () => {
  it('rejects unsafe JSON integers and values outside signed BIGINT without writing', async () => {
    for (const value of [9007199254740992, '9223372036854775808', -1, '1.5', '1e3']) {
      const response = await request('/transactions', 'POST', { ...body, qty: value });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
    }
    expect(append).not.toHaveBeenCalled();
  });

  it('preserves exact cents and quantities above MAX_SAFE_INTEGER from decimal strings on create and update', async () => {
    const max = '9223372036854775807';
    const response = await request('/transactions', 'POST', {
      ...body, qty: max, unitPriceCents: max, feeCents: max, amortRateCents: max,
    });
    expect(response.status).toBe(201);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      qty: BigInt(max), unitPriceCents: BigInt(max), feeCents: BigInt(max), amortRateCents: BigInt(max),
    }));
    const updated = await request(`/transactions/${tradeId}`, 'PATCH', { qty: max, feeCents: max });
    expect(updated.status).toBe(200);
    expect(update).toHaveBeenCalledWith('alice', tradeId, expect.objectContaining({ qty: BigInt(max), feeCents: BigInt(max) }));
    expect((await request(`/transactions/${tradeId}`, 'PATCH', { feeCents: 9007199254740992 })).status).toBe(400);
  });

  it('validates actual ISO calendar dates and UUID identifiers', async () => {
    for (const value of ['2025-02-29', '2024-13-01', '2024-04-31', 'March 1, 2024', '2024-01-01T12:00:00', '2024-01-01T25:00:00Z']) {
      expect(isoDateTime.safeParse(value).success).toBe(false);
    }
    expect(isoDateTime.safeParse('2024-02-29T12:30:00-03:00').success).toBe(true);
    expect(uuidId.safeParse('not-a-uuid').success).toBe(false);
    expect(nonnegativeBigInt.parse(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991n);
    expect((await request('/transactions', 'POST', { ...body, date: 'yesterday' })).status).toBe(400);
    expect((await request('/transactions/not-a-uuid', 'DELETE')).status).toBe(400);
    expect((await request('/transactions?accountId=not-a-uuid', 'GET')).status).toBe(400);
  });

  it('returns JSON envelopes for service errors and validation while preserving unauthenticated response', async () => {
    const invalid = await request('/transactions', 'POST', { ...body, qty: -1 });
    expect(invalid.headers.get('content-type')).toContain('application/json');
    expect(await invalid.json()).toMatchObject({ error: { code: 'VALIDATION', fields: expect.any(Array) } });
    const { JournalServiceError } = await import('../src/services/journal.js');
    append.mockRejectedValueOnce(new JournalServiceError('VALIDATION', 'Asset not found'));
    const rejected = await request('/transactions', 'POST', body);
    expect(rejected.status).toBe(400);
    expect(rejected.headers.get('content-type')).toContain('application/json');
    expect(await rejected.json()).toEqual({ error: { code: 'VALIDATION', message: 'Asset not found' } });
    const unauthorized = await app.request('/api/v1/transactions');
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });
});
