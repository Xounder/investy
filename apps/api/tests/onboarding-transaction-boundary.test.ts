import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { accounts, assets, brokers, holdings, portfolios, sessions, transactions } from '../src/db/schema.js';
import { createSessionToken, hashSessionToken } from '../src/lib/session.js';
import { replayJournal } from '../src/services/journal-money.js';
import { whereFacts } from './helpers/sql-facts.js';
import { SQL } from 'drizzle-orm';

type Row = Record<string, unknown>;
const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));

class BootstrapRows {
  readonly catalog: Row[] = [{ id: 'broker-1', name: 'Broker' }];
  readonly wallets: Row[] = [];
  readonly linked: Row[] = [];
  readonly instruments: Row[] = [];
  readonly journal: Row[] = [];
  readonly positions: Row[] = [];
  readonly tickets: Row[] = [{ id: 'session-1', userId: 'alice', token: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) }];
  failAccount = false;
  failTable: unknown;
  events: string[] = [];
  private rows(table: unknown) {
    return table === brokers ? this.catalog : table === portfolios ? this.wallets :
      table === accounts ? this.linked : table === sessions ? this.tickets :
        table === assets ? this.instruments : table === transactions ? this.journal :
          table === holdings ? this.positions : [];
  }
  async transaction<T>(run: (tx: BootstrapRows) => Promise<T>): Promise<T> {
    const snapshot = [this.catalog, this.wallets, this.linked, this.instruments, this.journal, this.positions]
      .map((rows) => rows.map((r) => ({ ...r })));
    try { const result = await run(this); this.events.push('commit'); return result; }
    catch (error) {
      for (const [index, rows] of [this.catalog, this.wallets, this.linked, this.instruments, this.journal, this.positions].entries()) {
        rows.splice(0, rows.length, ...snapshot[index]!);
      }
      this.events.push('rollback');
      throw error;
    }
  }
  select(fields?: Record<string, unknown>) {
    let table: unknown;
    let predicate: unknown;
    const query = {
      from(t: unknown) { table = t; return query; },
      where(p: unknown) { predicate = p; return query; },
      limit() { return query; },
      orderBy() { return query; },
      then: (resolve: (rows: Row[]) => unknown) => {
        const { columns, values } = whereFacts(predicate);
        const found = this.rows(table).filter((row) => columns.every((col, index) =>
          row[col.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] === values[index]));
        return Promise.resolve(resolve(found.slice(0, 1).map((row) => fields ?
          Object.fromEntries(Object.keys(fields).map((key) => {
            if (key === 'requiresHistoricalFx') {
              expect(whereFacts(fields[key]).columns).toEqual(['currency']);
              const expression = fields[key];
              expect(expression).toBeInstanceOf(SQL);
              const literals = (expression as SQL).queryChunks.flatMap((chunk) =>
                chunk && typeof chunk === 'object' && 'value' in chunk && Array.isArray(chunk.value) ? chunk.value : []);
              expect(literals.join('')).toContain("<> 'BRL'");
              if (typeof row.currency !== 'string') throw new Error('invalid asset currency in DB boundary');
              return [key, row.currency !== 'BRL'];
            }
            return [key, row[key]];
          })) : row)));
      },
    };
    return query;
  }
  insert(table: unknown) {
    return { values: (value: Row) => {
      if ((table === accounts && this.failAccount) || table === this.failTable) throw new Error('injected write failure');
      this.rows(table).push({ ...value });
      return { returning: async () => [value], then: (resolve: () => unknown) => Promise.resolve(resolve()) };
    } };
  }
}

const token = createSessionToken('alice');
const ownedId = 'f1a28af2-4e01-4c2a-bd5b-83262795c444';
const foreignId = '30bb293c-fd85-4cc4-bf99-0f28a01a541c';
let db: BootstrapRows;
beforeEach(() => { db = new BootstrapRows(); holder.db = db; });
const onboarding = (body: unknown) => app.request('/api/v1/onboarding', {
  method: 'POST', headers: { Cookie: `session=${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('onboarding HTTP / transactional DB boundary', () => {
  it('reuses an owned portfolio without renaming or inserting it, creating only a custom broker and owned account', async () => {
    db.wallets.push({ id: ownedId, userId: 'alice', name: 'Original', isDefault: false, currency: 'USD' });
    const response = await onboarding({ portfolioId: ownedId, brokerName: 'Nova Corretora',
      brokerCode: 'nova', accountName: 'Principal' });
    expect(response.status).toBe(201);
    const result = await response.json() as { portfolioId: string; accountId: string };
    expect(result.portfolioId).toBe(ownedId);
    expect(db.wallets).toEqual([{ id: ownedId, userId: 'alice', name: 'Original', isDefault: false, currency: 'USD' }]);
    expect(db.catalog).toMatchObject([{}, { name: 'Nova Corretora', code: 'nova', isSeeded: false }]);
    expect(db.linked).toMatchObject([{ id: result.accountId, userId: 'alice', portfolioId: ownedId,
      brokerId: db.catalog[1]?.id, name: 'Principal' }]);
    expect(db.events).toEqual(['commit']);
  });

  it('returns indistinguishable 404 for missing or foreign portfolio IDs before any write', async () => {
    db.wallets.push({ id: foreignId, userId: 'bob', name: 'Private' });
    for (const portfolioId of [foreignId, ownedId]) {
      const response = await onboarding({ portfolioId, brokerName: 'Custom' });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
    }
    expect((await onboarding({ portfolioId: 'invalid', brokerName: 'Custom' })).status).toBe(400);
    expect(db.wallets).toEqual([{ id: foreignId, userId: 'bob', name: 'Private' }]);
    expect(db.linked).toEqual([]);
    expect(db.catalog).toHaveLength(1);
    expect(db.events).toEqual(['rollback', 'rollback']);
  });

  it('rolls back the new broker and account while preserving an existing portfolio after account failure', async () => {
    const existing = { id: ownedId, userId: 'alice', name: 'Keep', isDefault: true, currency: 'BRL' };
    db.wallets.push(existing);
    db.failAccount = true;
    const response = await onboarding({ portfolioId: ownedId, brokerName: 'Custom' });
    expect(response.status).toBe(500);
    expect(db.wallets).toEqual([existing]);
    expect(db.catalog).toHaveLength(1);
    expect(db.linked).toEqual([]);
    expect(db.events).toEqual(['rollback']);
  });

  it('rejects nonexistent broker and orphan first holding without inserting a portfolio', async () => {
    const missing = await onboarding({ brokerId: 'missing' });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: { code: 'INVALID_BROKER', message: 'Broker not found' } });
    expect((await onboarding({ firstHolding: { assetSymbol: 'X', assetName: 'X', assetClass: 'acao', qty: 1, unitPriceCents: 1, date: '2026-01-01T00:00:00Z' } })).status).toBe(400);
    expect(db.wallets).toEqual([]);
    expect(db.events).toEqual([]);
  });
  it('creates owned default portfolio/account or rolls them both back on account failure', async () => {
    db.failAccount = true;
    expect((await onboarding({ brokerId: 'broker-1' })).status).toBe(500);
    expect(db.wallets).toEqual([]);
    expect(db.linked).toEqual([]);
    expect(db.events).toEqual(['rollback']);
    db.failAccount = false;
    const created = await onboarding({ brokerId: 'broker-1', portfolioName: 'Test', accountName: 'Primary' });
    expect(created.status).toBe(201);
    const body = await created.json() as { portfolioId: string; accountId: string };
    expect(db.wallets).toMatchObject([{ id: body.portfolioId, userId: 'alice', name: 'Test', currency: 'BRL', isDefault: true }]);
    expect(db.linked).toMatchObject([{ id: body.accountId, userId: 'alice', brokerId: 'broker-1', portfolioId: body.portfolioId, name: 'Primary' }]);
    expect(db.events).toEqual(['rollback', 'commit']);
  });

  it('replays a first BRL buy into the owned holding using journal math, never handwritten averages', async () => {
    const firstHolding = { assetSymbol: 'PETR4', assetName: 'Petrobras', assetClass: 'acao',
      qty: 3, unitPriceCents: 101, feeCents: 2, date: '2026-01-01T00:00:00.000Z' };
    const response = await onboarding({ brokerName: 'Custom', firstHolding });
    expect(response.status).toBe(201);
    const { portfolioId, accountId } = await response.json() as { portfolioId: string; accountId: string };
    expect(db.catalog).toHaveLength(2);
    expect(db.linked).toMatchObject([{ id: accountId, userId: 'alice', portfolioId, brokerId: db.catalog[1]?.id }]);
    expect(db.journal).toMatchObject([{ userId: 'alice', portfolioId, accountId, type: 'buy', source: 'onboarding', currency: 'BRL', qty: 3n, feeCents: 2n }]);
    const expected = replayJournal([{ type: 'buy', date: new Date(firstHolding.date), qty: 3n,
      unitPriceCents: 101n, feeCents: 2n, currency: 'BRL', fxRateToBRL: null, factor: null, amortRateCents: null }]);
    expect(db.positions).toMatchObject([{ userId: 'alice', accountId, assetId: db.instruments[0]?.id,
      qty: expected.qty, avgPriceCents: expected.avgPriceCents, costBasisCents: expected.costBasisCents,
      realizedPnlCents: expected.realizedPnlCents }]);
  });

  it.each([assets, transactions, holdings])('rolls back every new broker/bootstrap row when a downstream write fails', async (table) => {
    db.failTable = table;
    const result = await onboarding({ brokerName: 'Custom', firstHolding: {
      assetSymbol: 'PETR4', assetName: 'Petrobras', assetClass: 'acao', qty: 3,
      unitPriceCents: 101, date: '2026-01-01T00:00:00.000Z',
    } });
    expect(result.status).toBe(500);
    expect([db.catalog.length, db.wallets.length, db.linked.length, db.instruments.length, db.journal.length, db.positions.length]).toEqual([1, 0, 0, 0, 0, 0]);
    expect(db.events).toEqual(['rollback']);
  });

  it.each(['USD', 'EUR'])('rejects an existing %s instrument without a historical FX rate before committing any bootstrap row', async (currency) => {
    db.instruments.push({ id: 'foreign-1', symbol: 'AAPL', currency });
    const response = await onboarding({ brokerName: 'Custom', firstHolding: {
      assetSymbol: 'AAPL', assetName: 'Apple', assetClass: 'acao', qty: 1,
      unitPriceCents: 100, date: '2026-01-01T00:00:00.000Z',
    } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'FX_REQUIRED' } });
    expect([db.catalog.length, db.wallets.length, db.linked.length, db.journal.length, db.positions.length]).toEqual([1, 0, 0, 0, 0]);
    expect(db.events).toEqual(['rollback']);
  });

  it('accepts an existing BRL asset using the projected false gate', async () => {
    db.instruments.push({ id: 'brl-1', symbol: 'PETR4', currency: 'BRL' });
    const response = await onboarding({ brokerId: 'broker-1', firstHolding: {
      assetSymbol: 'PETR4', assetName: 'Petrobras', assetClass: 'acao', qty: 2,
      unitPriceCents: 125, date: '2026-01-01T00:00:00.000Z',
    } });
    expect(response.status).toBe(201);
    expect(db.instruments).toHaveLength(1);
    expect(db.journal).toMatchObject([{ assetId: 'brl-1', currency: 'BRL', qty: 2n }]);
    expect(db.positions).toMatchObject([{ assetId: 'brl-1', qty: 2n, costBasisCents: 250n }]);
  });
});
