import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { accounts, holdings, portfolios, transactions } from '../src/db/schema.js';
import { createFakeDb } from './helpers/fake-db.js';
import { whereFacts } from './helpers/sql-facts.js';
import { accountRepository } from '../src/repositories/accounts.js';

const { holder, findSession } = vi.hoisted(() => ({ holder: { db: null as unknown }, findSession: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));

const db = createFakeDb();
holder.db = db;
const portfolio = { id: '00000000-0000-4000-8000-000000000002', userId: 'alice', name: 'Main', currency: 'BRL', isDefault: false };
const account = { id: '00000000-0000-4000-8000-000000000001', userId: 'alice', portfolioId: '00000000-0000-4000-8000-000000000002', brokerId: '00000000-0000-4000-8000-000000000004', name: 'Account' };
const trade = { id: '00000000-0000-4000-8000-000000000005', userId: 'alice', accountId: '00000000-0000-4000-8000-000000000001', portfolioId: '00000000-0000-4000-8000-000000000002', assetId: '00000000-0000-4000-8000-000000000003', type: 'buy', date: new Date('2025-01-01'), qty: 2n, unitPriceCents: 100n };

function request(user: string, path: string, method = 'GET', body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: { Cookie: `session=${createSessionToken(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  db.reset();
  findSession.mockImplementation(async () => ({ expiresAt: new Date(Date.now() + 60_000) }));
});

describe('TASK-05 production routes with persistence boundary', () => {
  it('includes both owner and id in update and delete SQL, not just response filtering', async () => {
    db.setResults(accounts, [{ ...account, name: 'Renamed' }]);
    expect(await accountRepository.update('00000000-0000-4000-8000-000000000001', 'alice', { name: 'Renamed' })).toMatchObject({ id: '00000000-0000-4000-8000-000000000001' });
    expect(whereFacts(db.getUpdatePayloads()[0]?.where)).toEqual({ columns: ['user_id', 'id'], values: ['alice', '00000000-0000-4000-8000-000000000001'] });
    expect(await accountRepository.delete('00000000-0000-4000-8000-000000000001', 'alice')).toBe(true);
    expect(whereFacts(db.getDeleteCaptures()[0]?.where)).toEqual({ columns: ['user_id', 'id'], values: ['alice', '00000000-0000-4000-8000-000000000001'] });
  });

  it('filters and pages the journal by the session owner, with invalid pages rejected', async () => {
    db.setResults(transactions, [trade]);
    const res = await request('alice', '/transactions?portfolioId=00000000-0000-4000-8000-000000000002&accountId=00000000-0000-4000-8000-000000000001&assetId=00000000-0000-4000-8000-000000000003&type=buy&from=2025-01-01&to=2025-02-01&page=2');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ page: 2, hasMore: false, items: [{ id: '00000000-0000-4000-8000-000000000005', qty: '2' }] });
    const capture = db.getWhereCaptures().find((item) => item.table === transactions);
    expect(whereFacts(capture?.where)).toEqual({
      columns: ['user_id', 'portfolio_id', 'account_id', 'asset_id', 'type', 'date', 'date'],
      values: ['alice', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'buy', new Date('2025-01-01'), new Date('2025-02-01')],
    });
    expect((await request('alice', '/transactions?page=0')).status).toBe(400);
    expect((await request('alice', '/transactions?from=garbage')).status).toBe(400);
  });

  it('guards portfolio and account deletion on transactions and denies cross-user access', async () => {
    db.setResults(portfolios, [portfolio]);
    db.setResults(holdings, []);
    db.setResults(transactions, [trade]);
    expect((await request('alice', '/portfolios/00000000-0000-4000-8000-000000000002', 'DELETE')).status).toBe(409);
    expect(db.getDeleteCaptures()).toHaveLength(0);
    expect(whereFacts(db.getWhereCaptures().find((c) => c.table === transactions)?.where).values).toContain('alice');

    db.reset();
    db.setResults(accounts, [account]);
    db.setResults(transactions, [trade]);
    expect((await request('alice', '/accounts/00000000-0000-4000-8000-000000000001', 'DELETE')).status).toBe(409);
    expect(db.getDeleteCaptures()).toHaveLength(0);

    db.reset();
    db.setResults(portfolios, []);
    expect((await request('bob', '/portfolios/00000000-0000-4000-8000-000000000002', 'DELETE')).status).toBe(404);
    expect(whereFacts(db.getWhereCaptures()[0]?.where)).toEqual({ columns: ['user_id', 'id'], values: ['bob', '00000000-0000-4000-8000-000000000002'] });
    expect((await request('alice', '/portfolios', 'POST', { name: '' })).status).toBe(400);
  });

  it('returns empty aggregates and snapshots with owned portfolio predicates', async () => {
    db.setResults(portfolios, [portfolio]);
    db.setResults(holdings, []);
    const summary = await request('alice', '/portfolio/summary?portfolioId=00000000-0000-4000-8000-000000000002');
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({ totalCostBasisCents: '0', totalMarketValueCents: '0', allocation: { byClass: [], bySector: [] } });
    expect(await (await request('alice', '/portfolio/allocation?portfolioId=00000000-0000-4000-8000-000000000002')).json()).toEqual({ byClass: [], bySector: [] });
    const snapshots = await request('alice', '/portfolio/snapshots?portfolioId=00000000-0000-4000-8000-000000000002&range=all');
    expect(await snapshots.json()).toEqual({ snapshots: [] });
    expect((await request('alice', '/portfolio/snapshots?portfolioId=00000000-0000-4000-8000-000000000002&range=bad')).status).toBe(400);
  });
});
