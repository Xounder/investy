import { describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';

const { findSession, listByAsset, listForHolding, valuations } = vi.hoisted(() => ({
  findSession: vi.fn(), listByAsset: vi.fn(), listForHolding: vi.fn(), valuations: vi.fn(),
}));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));
vi.mock('../src/repositories/holdings.js', () => ({ holdingRepository: { listByAsset } }));
vi.mock('../src/repositories/transactions.js', () => ({ transactionRepository: { listForHolding } }));
vi.mock('../src/services/valuation.js', () => ({ computeValuations: valuations }));

const assetId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000001';

describe('GET holding detail display lots', () => {
  it('returns a partial-sale cohort breakdown alongside the effective quote and unmodified events', async () => {
    findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
    listByAsset.mockResolvedValue([{
      id: 'holding-1', accountId, assetId, qty: 5n, costBasisCents: 7000n,
      avgPriceCents: 1400n, realizedPnlCents: 8000n,
      asset: { id: assetId, symbol: 'PETR4', currency: 'BRL' },
    }]);
    valuations.mockResolvedValue(new Map([['holding-1', { priceCentsBRL: 3000n, isStale: true }]]));
    listForHolding.mockResolvedValue([
      { id: 'a', type: 'buy', date: new Date('2025-01-01'), qty: 6n },
      { id: 'b', type: 'buy', date: new Date('2025-01-02'), qty: 4n },
      { id: 'c', type: 'sell', date: new Date('2025-02-01'), qty: 5n },
    ]);
    const response = await app.request(`/api/v1/holdings/${assetId}`, {
      headers: { Cookie: `session=${createSessionToken('alice')}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      summary: { qty: '5', marketValueCentsBRL: '15000' },
      quote: { priceCentsBRL: '3000', isStale: true },
      lots: [
        { accountId, transactionId: 'a', qty: '3', costBasisCents: '4200' },
        { accountId, transactionId: 'b', qty: '2', costBasisCents: '2800' },
      ],
      events: [{ id: 'a' }, { id: 'b' }, { id: 'c', type: 'sell' }],
    });
    expect(listByAsset).toHaveBeenCalledWith('alice', assetId);
    expect(listForHolding).toHaveBeenCalledWith('alice', accountId, assetId);
  });
});
