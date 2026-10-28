import { expect, it, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { accounts, assets, brokers, holdings, portfolios, transactions, users } from '../src/db/schema.js';
import { restoreExport } from '../src/services/restore.js';
import { Task13Db } from './helpers/task13-db.js';

const { holder, findSession } = vi.hoisted(() => ({ holder: { db: null as unknown }, findSession: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));

const ids = {
  portfolio: '00000000-0000-4000-8000-000000000002',
  account: '00000000-0000-4000-8000-000000000001',
  asset: '00000000-0000-4000-8000-000000000003',
  broker: '00000000-0000-4000-8000-000000000004',
};
function complete(table: typeof portfolios | typeof accounts | typeof assets | typeof brokers, id: string, extra: Record<string, unknown>) {
  const row: Record<string, unknown> & { id: string } = { id };
  for (const [name, column] of Object.entries(getTableColumns(table))) {
    if (name === 'id') continue;
    row[name] = column.dataType === 'date' ? new Date('2025-01-01T00:00:00.000Z') :
      column.dataType === 'boolean' ? false : column.notNull ? 'value' : null;
  }
  return { ...row, ...extra };
}
async function postTrade(body: Record<string, unknown>) {
  return app.request('/api/v1/transactions', {
    method: 'POST', headers: { Cookie: `session=${createSessionToken('alice')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: ids.account, assetId: ids.asset, ...body }),
  });
}

it('POST buy then sell recomputes changed basis and an authentic export restores after strict journal verification', async () => {
  const source = new Task13Db();
  holder.db = source;
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  source.seed(users, { id: 'alice', email: 'a@example.com', passwordHash: 'private' });
  source.seed(brokers, complete(brokers, ids.broker, { name: 'Broker', code: 'BRK' }));
  source.seed(assets, complete(assets, ids.asset, { name: 'Petrobras', symbol: 'PETR4', class: 'acao', currency: 'BRL' }));
  source.seed(portfolios, complete(portfolios, ids.portfolio, { userId: 'alice', name: 'Main', currency: 'BRL' }));
  source.seed(accounts, complete(accounts, ids.account, { userId: 'alice', portfolioId: ids.portfolio, brokerId: ids.broker, name: 'Broker account' }));

  const buy = await postTrade({ type: 'buy', date: '2025-02-01', qty: 3, unitPriceCents: 1000 });
  expect(buy.status).toBe(201);
  expect(source.rows(holdings)[0]).toMatchObject({ qty: 3n, costBasisCents: 3000n });
  const sell = await postTrade({ type: 'sell', date: '2025-02-02', qty: 1, unitPriceCents: 1500, feeCents: 50 });
  expect(sell.status).toBe(201);
  expect(source.rows(transactions).find((row) => row.type === 'sell')).toMatchObject({ realizedPnlCents: 450n });
  expect(await sell.json()).toMatchObject({ realizedPnlCents: '450' });
  expect(source.rows(holdings)[0]).toMatchObject({ qty: 2n, avgPriceCents: 1000n, costBasisCents: 2000n, realizedPnlCents: 450n });

  const response = await app.request('/api/v1/export?format=json', {
    method: 'POST', headers: { Cookie: `session=${createSessionToken('alice')}` },
  });
  expect(response.status).toBe(200);
  const archive = await response.json() as {
    holdings: Array<{ qty: string; costBasisCents: string; realizedPnlCents: string }>;
    transactions: Array<{ type: string; realizedPnlCents: string }>;
  };
  expect(archive.holdings[0]).toMatchObject({ qty: '2', costBasisCents: '2000', realizedPnlCents: '450' });
  expect(archive.transactions).toHaveLength(2);
  expect(archive.transactions.find((row: { type: string }) => row.type === 'sell')).toMatchObject({ realizedPnlCents: '450' });

  const target = new Task13Db();
  target.seed(users, { id: 'alice', email: 'a@example.com', passwordHash: 'new-private-hash' });
  holder.db = target;
  await restoreExport('alice', archive);
  expect(target.rows(holdings)[0]).toMatchObject({ id: source.rows(holdings)[0]?.id, qty: 2n, costBasisCents: 2000n, realizedPnlCents: 450n });
  expect(target.rows(transactions).map((row) => row.id)).toEqual(source.rows(transactions).map((row) => row.id));
  expect(target.rows(users)[0]?.passwordHash).toBe('new-private-hash');
});
