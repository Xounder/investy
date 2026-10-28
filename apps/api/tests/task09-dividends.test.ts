import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectFii } from '../src/services/dividends/projection.js';
import { createSessionToken } from '../src/lib/session.js';
import app from '../src/app.js';
import { eligibleQuantity } from '../src/services/dividends.js';
import type { transactions } from '../src/db/schema.js';

const { session, agenda, history, create, update } = vi.hoisted(() => ({
  session: vi.fn(), agenda: vi.fn(), history: vi.fn(), create: vi.fn(), update: vi.fn(),
}));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: session } }));
vi.mock('../src/services/dividends.js', async (original) => ({
  ...await original<typeof import('../src/services/dividends.js')>(),
  listAgenda: agenda, listHistory: history, createDividend: create, updateDividend: update,
}));

const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const portfolioId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const dividendId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const headers = { Cookie: `session=${createSessionToken('alice')}`, 'Content-Type': 'application/json' };

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  agenda.mockResolvedValue({ items: [{ id: dividendId, status: 'expected' }], projections: [] });
  history.mockResolvedValue({ totalCents: '120', months: [{ year: 2026, month: 1, totalCents: '120' }] });
  create.mockResolvedValue({ id: dividendId, status: 'expected' });
  update.mockResolvedValue({ id: dividendId, status: 'confirmed' });
});

describe('FII projection', () => {
  const now = new Date('2026-03-15');
  it('predicts regular cadence with sufficient history', () => {
    expect(projectFii(assetId, ['2026-01-10', '2026-02-10', '2026-03-10'].map((s) => new Date(s)), now))
      .toMatchObject({ nextExDate: '2026-04-10', cadence: 'monthly', confidence: 'high' });
  });
  it('reports insufficient and irregular history honestly', () => {
    expect(projectFii(assetId, [new Date('2026-01-01')], now)).toBeNull();
    expect(projectFii(assetId, ['2025-08-01', '2025-10-10', '2026-01-01'].map((s) => new Date(s)), now))
      .toMatchObject({ cadence: 'irregular', confidence: 'low' });
  });
});

it('computes entitlement from pre-ex-date journal rather than current holdings', () => {
  const base = { accountId: assetId, userId: 'alice', assetId, portfolioId,
    feeCents: 0n, currency: 'BRL', fxRateToBRL: null, factor: null, amortRateCents: null,
    realizedPnlCents: 0n, source: 'manual', notaRefId: null, notes: null, createdAt: new Date('2026-01-01') };
  const events = [
    { ...base, id: '1', type: 'buy', date: new Date('2026-01-01'), qty: 10n, unitPriceCents: 100n },
    { ...base, id: '2', type: 'sell', date: new Date('2026-01-09'), qty: 3n, unitPriceCents: 100n },
    { ...base, id: '3', type: 'sell', date: new Date('2026-01-11'), qty: 7n, unitPriceCents: 100n },
  ] as (typeof transactions.$inferSelect)[];
  expect(eligibleQuantity(events, new Date('2026-01-10'))).toBe(7n);
  expect(eligibleQuantity(events, new Date('2026-01-12'))).toBe(0n);
});

describe('authenticated dividend routes', () => {
  it('requires a session and validates the agenda range', async () => {
    expect((await app.request('/api/v1/dividends/agenda?from=2026-01-01&to=2026-02-01')).status).toBe(401);
    const bad = await app.request('/api/v1/dividends/agenda?from=2026-02-01&to=2026-01-01', { headers });
    expect(bad.status).toBe(400);
    expect(agenda).not.toHaveBeenCalled();
  });
  it('passes the session owner to agenda and history and returns their contracts', async () => {
    const result = await app.request('/api/v1/dividends/agenda?from=2026-01-01&to=2026-02-01', { headers });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ items: [{ status: 'expected' }], projections: [] });
    expect(agenda).toHaveBeenCalledWith('alice', new Date('2026-01-01'), new Date('2026-02-01'));
    const income = await app.request('/api/v1/dividends/history?year=2026&month=1', { headers });
    expect(await income.json()).toMatchObject({ totalCents: '120' });
    expect(history).toHaveBeenCalledWith('alice', 2026, 1);
  });
  it('rejects invalid dates and rates before writing; creates and confirms owned records', async () => {
    const input = { assetId, portfolioId, kind: 'rendimento', exDate: '2026-01-10',
      paymentDate: '2026-02-10', rateCentsPerUnit: '120' };
    const url = '/api/v1/dividends';
    for (const invalid of [{ ...input, paymentDate: '2026-01-10' }, { ...input, rateCentsPerUnit: 0 },
      { ...input, exDate: '2026-02-30' }]) {
      expect((await app.request(url, { method: 'POST', headers, body: JSON.stringify(invalid) })).status).toBe(400);
    }
    expect(create).not.toHaveBeenCalled();
    const saved = await app.request(url, { method: 'POST', headers, body: JSON.stringify(input) });
    expect(saved.status).toBe(201);
    expect(create).toHaveBeenCalledWith('alice', expect.objectContaining({ rateCentsPerUnit: 120n }));
    const confirmed = await app.request(`${url}/${dividendId}`, { method: 'PATCH', headers,
      body: JSON.stringify({ status: 'confirmed', paymentDate: '2026-02-11' }) });
    expect(confirmed.status).toBe(200);
    expect(update).toHaveBeenCalledWith('alice', dividendId, expect.objectContaining({ status: 'confirmed' }));
  });
  it('validates historical FX on paid PATCH without rounding the input rate', async () => {
    const url = `/api/v1/dividends/${dividendId}`;
    expect((await app.request(url, { method: 'PATCH', headers,
      body: JSON.stringify({ status: 'paid', fxRateToBRL: '0' }) })).status).toBe(400);
    expect((await app.request(url, { method: 'PATCH', headers,
      body: JSON.stringify({ status: 'paid', fxRateToBRL: '9223372036854775808' }) })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
    const paid = await app.request(url, { method: 'PATCH', headers,
      body: JSON.stringify({ status: 'paid', fxRateToBRL: '1500000' }) });
    expect(paid.status).toBe(200);
    expect(update).toHaveBeenCalledWith('alice', dividendId,
      expect.objectContaining({ status: 'paid', fxRateToBRL: 1_500_000n }));
  });
});
