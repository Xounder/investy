import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';

const { list, valuations, findSession } = vi.hoisted(() => ({ list: vi.fn(), valuations: vi.fn(), findSession: vi.fn() }));
vi.mock('../src/repositories/holdings.js', () => ({ holdingRepository: { list } }));
vi.mock('../src/services/valuation.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/services/valuation.js')>(), computeValuations: valuations,
}));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));

beforeEach(() => {
  vi.clearAllMocks();
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  list.mockResolvedValue([{ id: 'holding', accountId: 'account', assetId: 'asset', qty: 2n,
    costBasisCents: 100n, avgPriceCents: 50n, realizedPnlCents: 0n,
    asset: { symbol: 'PETR4', name: 'Petrobras', class: 'acao', sector: null, currency: 'BRL' } }]);
});

describe('TASK-07 holdings response', () => {
  it('serializes signed percentage points and preserves null for unavailable change', async () => {
    const url = '/api/v1/holdings';
    const headers = { Cookie: `session=${createSessionToken('alice')}` };
    valuations.mockResolvedValueOnce(new Map([['holding', { priceCents: 90n, priceCentsBRL: 90n,
      marketValueCentsBRL: 180n, unrealizedPnlCentsBRL: 80n, dayChangePercent: -10,
      isStale: false, isOverride: false }]]));
    const first = await app.request(url, { headers });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ holdings: [{ dayChangePercent: -10, priceCents: '90' }] });
    valuations.mockResolvedValueOnce(new Map([['holding', { priceCents: 120n, priceCentsBRL: 120n,
      marketValueCentsBRL: 240n, unrealizedPnlCentsBRL: 140n, dayChangePercent: null,
      isStale: false, isOverride: true }]]));
    const second = await app.request(url, { headers });
    expect(await second.json()).toMatchObject({ holdings: [{ dayChangePercent: null, isOverride: true }] });
    expect(list).toHaveBeenCalledWith('alice', { portfolioId: undefined, accountId: undefined });
  });
});
