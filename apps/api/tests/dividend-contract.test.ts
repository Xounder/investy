import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { replayJournal } from '../src/services/journal-money.js';
import { parseCsv } from '../src/services/import/csv-parser.js';

const { findSession, findAccount, append } = vi.hoisted(() => ({
  findSession: vi.fn(), findAccount: vi.fn(), append: vi.fn(),
}));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));
vi.mock('../src/repositories/accounts.js', () => ({ accountRepository: { findById: findAccount } }));
vi.mock('../src/services/journal.js', async (loadOriginal) => ({
  ...await loadOriginal<typeof import('../src/services/journal.js')>(), appendJournalEvent: append,
}));

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const body = { type: 'dividend', date: '2026-01-01', accountId, assetId, qty: '3', unitPriceCents: '42' };

beforeEach(() => {
  vi.clearAllMocks();
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  findAccount.mockResolvedValue({ id: accountId, portfolioId: accountId });
  append.mockImplementation(async (input) => ({ ...input, id: assetId }));
});

describe('dividend API and import contract', () => {
  it('accepts a distinct dividend through POST and preserves bigint cents in JSON', async () => {
    const response = await app.request('/api/v1/transactions', {
      method: 'POST', headers: { Cookie: `session=${createSessionToken('alice')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ type: 'dividend', qty: '3', unitPriceCents: '42' });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'dividend', qty: 3n, unitPriceCents: 42n, feeCents: 0n }));
  });

  it('replays BRL and historical USD dividend income without adding shares or basis', () => {
    const base = { date: new Date('2026-01-01'), feeCents: 0n, factor: null, amortRateCents: null };
    const holding = replayJournal([
      { ...base, type: 'buy', qty: 3n, unitPriceCents: 100n, currency: 'BRL' },
      { ...base, type: 'dividend', qty: 3n, unitPriceCents: 10n, currency: 'BRL' },
      { ...base, type: 'dividend', qty: 3n, unitPriceCents: 25n, currency: 'USD', fxRateToBRL: 5_000_000n },
      { ...base, type: 'jcp', qty: 3n, unitPriceCents: 5n, currency: 'BRL' },
    ]);
    expect(holding).toEqual({ qty: 3n, avgPriceCents: 100n, costBasisCents: 300n, realizedPnlCents: 420n });
    expect(() => replayJournal([{ ...base, type: 'dividend', qty: 3n, unitPriceCents: 25n, currency: 'USD' }])).toThrow(/historical fxRateToBRL/);
  });

  it('imports dividend as its own CSV event, not JCP', () => {
    const parsed = parseCsv('type,date,account,symbol,qty,unitpricecents,feecents\ndividend,2026-01-01,Main,PETR4,3,42,0\njcp,2026-01-02,Main,PETR4,3,10,0');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((row) => row.type)).toEqual(['dividend', 'jcp']);
  });
});
