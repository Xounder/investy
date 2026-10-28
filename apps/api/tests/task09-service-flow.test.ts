import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { accounts, assets, dividends, holdings, portfolios, transactions } from '../src/db/schema.js';
import { whereFacts } from './helpers/sql-facts.js';
import { createDividend, listAgenda, listHistory, updateDividend } from '../src/services/dividends.js';
import { syncFiiDividends } from '../src/services/dividends/sync.js';

const holder = vi.hoisted(() => ({ db: null as unknown, session: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: holder.session } }));

type Row = Record<string, unknown>;
const data = new Map<unknown, Row[]>();
let failHoldingWrite = false;
let transactionQueue = Promise.resolve();
const journalLocks: string[] = [];

class Query {
  private table: unknown;
  private predicate: { columns: string[]; values: unknown[] } = { columns: [], values: [] };
  private payload: Row = {};
  private sorted = false;
  private max = Infinity;
  constructor(private readonly mode: 'select' | 'insert' | 'update', table?: unknown,
    private readonly columns?: Row) { this.table = table; }
  from(table: unknown) { this.table = table; return this; }
  where(predicate: unknown) { this.predicate = whereFacts(predicate); return this; }
  orderBy() { this.sorted = true; return this; }
  limit(count: number) { this.max = count; return this; }
  values(payload: Row) { this.payload = payload; return this; }
  set(payload: Row) { this.payload = payload; return this; }
  returning() { return Promise.resolve(this.run()); }
  then<T>(resolve: (value: Row[]) => T, reject?: (reason: unknown) => unknown) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject);
  }
  private run(): Row[] {
    if (this.mode === 'insert') {
      if (failHoldingWrite && this.table === holdings) throw new Error('holding write failed');
      const row = { createdAt: new Date('2026-01-01'), ...this.payload };
      data.set(this.table, [...(data.get(this.table) ?? []), row]);
      return [row];
    }
    const selected = (data.get(this.table) ?? []).filter((row) => this.predicate.columns.every((column, i) => {
      const key = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      const value = this.predicate.values[i];
      // Comparisons on date columns represent the agenda/history range filters.
      if (value instanceof Date && this.predicate.columns.filter((c) => c === column).length > 1 &&
        (column === 'payment_date' || column === 'ex_date')) {
        const occurrences = this.predicate.columns.slice(0, i).filter((c) => c === column).length;
        return occurrences === 0 ? (row[key] as Date) >= value : (row[key] as Date) < value;
      }
      return row[key] instanceof Date && value instanceof Date
        ? (row[key] as Date).getTime() === value.getTime() : row[key] === value;
    }));
    if (this.mode === 'update') {
      if (failHoldingWrite && this.table === holdings) throw new Error('holding write failed');
      selected.forEach((row) => Object.assign(row, this.payload));
      return selected;
    }
    const ordered = this.sorted ? [...selected].sort((a, b) =>
      ((a.date as Date | undefined)?.getTime() ?? 0) - ((b.date as Date | undefined)?.getTime() ?? 0) ||
      ((a.createdAt as Date | undefined)?.getTime() ?? 0) - ((b.createdAt as Date | undefined)?.getTime() ?? 0) ||
      String(a.id).localeCompare(String(b.id))) : selected;
    if (!this.columns) return ordered.slice(0, this.max);
    return ordered.slice(0, this.max).map((row) => Object.fromEntries(Object.entries(this.columns!).map(([key]) => [key, row[key]])));
  }
}

interface DbDouble {
  select: (columns?: Row) => Query;
  insert: (table: unknown) => Query;
  update: (table: unknown) => Query;
  execute: () => Promise<void>;
  transaction: <T>(fn: (tx: DbDouble) => Promise<T>) => Promise<T>;
}
const db: DbDouble = {
  select: (columns?: Row) => new Query('select', undefined, columns),
  insert: (table: unknown) => new Query('insert', table),
  update: (table: unknown) => new Query('update', table),
  execute: async (statement?: unknown) => {
    const lock = whereFacts(statement).values.find((value) => typeof value === 'string' && value.startsWith('journal:'));
    if (typeof lock === 'string') journalLocks.push(lock);
  },
  transaction: async <T>(fn: (tx: DbDouble) => Promise<T>): Promise<T> => {
    // Database-boundary double serializes transactions, like the advisory lock.
    const previous = transactionQueue;
    let release!: () => void;
    transactionQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = new Map([...data].map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
    try { return await fn(db); }
    catch (error) { data.clear(); for (const [table, rows] of snapshot) data.set(table, rows); throw error; }
    finally { release(); }
  },
};
holder.db = db;

const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const portfolioId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const accountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const exDate = new Date('2026-01-10');
const paymentDate = new Date('2026-02-10');
const entitlement = { userId: 'alice', portfolioId, accountId, assetId,
  id: 'buy-1', type: 'buy', date: new Date('2026-01-01'), createdAt: new Date('2026-01-01'),
  qty: 5n, unitPriceCents: 100n, feeCents: 0n, currency: 'BRL', fxRateToBRL: null,
  factor: null, amortRateCents: null, realizedPnlCents: 0n, notes: null };
const input = { assetId, portfolioId, kind: 'rendimento' as const, exDate, paymentDate, rateCentsPerUnit: 12n };

beforeEach(() => {
  data.clear(); journalLocks.length = 0; transactionQueue = Promise.resolve(); failHoldingWrite = false;
  holder.session.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  data.set(portfolios, [{ id: portfolioId, userId: 'alice' }]);
  data.set(assets, [{ id: assetId, symbol: 'HGLG11', name: 'FII', class: 'fii', currency: 'BRL' }]);
  data.set(accounts, [{ id: accountId, portfolioId, userId: 'alice' }]);
  data.set(transactions, [{ ...entitlement }, { ...entitlement, id: 'sale-1', type: 'sell',
    qty: 5n, date: new Date('2026-01-11'), createdAt: new Date('2026-01-11') }]);
  data.set(holdings, [{ id: 'holding', userId: 'alice', accountId, assetId, qty: 0n,
    costBasisCents: 0n, avgPriceCents: 0n, realizedPnlCents: 0n }]);
  data.set(dividends, []);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('real dividend service with transactional DB boundary', () => {
  it('creates owned dividends from ex-date position and deduplicates by kind/date', async () => {
    await expect(createDividend('bob', input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const saved = await createDividend('alice', input);
    expect(saved).toMatchObject({ status: 'expected', eligibleQty: '5', amountCents: '60' });
    await expect(createDividend('alice', input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(data.get(dividends)).toHaveLength(1);
  });

  it('calculates eligibility per account and posts only to accounts entitled on the ex-date', async () => {
    const otherAccount = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    data.get(accounts)!.push({ id: otherAccount, portfolioId, userId: 'alice' });
    data.get(transactions)!.push({ ...entitlement, id: 'buy-2', accountId: otherAccount, qty: 2n });
    const saved = await createDividend('alice', input);
    expect(saved.eligibleQty).toBe('7');
    await updateDividend('alice', saved.id, { status: 'confirmed' });
    await updateDividend('alice', saved.id, { status: 'paid' });
    expect(data.get(transactions)?.filter((row) => row.dividendId === saved.id).map((row) => row.qty))
      .toEqual([5n, 2n]);
    expect((await listHistory('alice', 2026, 2)).totalCents).toBe('84');
  });

  it('enforces forward-only status and owner checks; pays once after the ex-date sale', async () => {
    const { id } = await createDividend('alice', input);
    await expect(updateDividend('bob', id, { status: 'confirmed' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(updateDividend('alice', id, { status: 'paid' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await updateDividend('alice', id, { status: 'confirmed' })).status).toBe('confirmed');
    const [paid, duplicate] = await Promise.allSettled([
      updateDividend('alice', id, { status: 'paid' }), updateDividend('alice', id, { status: 'paid' }),
    ]);
    expect(paid.status).toBe('fulfilled');
    expect(duplicate).toMatchObject({ status: 'rejected', reason: { code: 'CONFLICT' } });
    expect(data.get(transactions)?.filter((row) => row.dividendId === id))
      .toEqual([expect.objectContaining({ qty: 5n, unitPriceCents: 12n, type: 'dividend' })]);
    expect(data.get(holdings)?.[0]).toMatchObject({ qty: 0n, realizedPnlCents: 60n });
    await expect(updateDividend('alice', id, { status: 'confirmed' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rolls back paid status and receipt when holding recompute fails', async () => {
    const { id } = await createDividend('alice', input);
    await updateDividend('alice', id, { status: 'confirmed' });
    failHoldingWrite = true;
    await expect(updateDividend('alice', id, { status: 'paid' })).rejects.toThrow('holding write failed');
    expect(data.get(dividends)?.[0]?.status).toBe('confirmed');
    expect(data.get(transactions)?.filter((row) => row.dividendId === id)).toHaveLength(0);
  });

  it('excludes amortization from paid income totals while preserving capital-return items', async () => {
    const receipt = await createDividend('alice', input);
    const capital = await createDividend('alice', { ...input, kind: 'amortizacao', rateCentsPerUnit: 7n });
    for (const id of [receipt.id, capital.id]) {
      await updateDividend('alice', id, { status: 'confirmed' });
      await updateDividend('alice', id, { status: 'paid' });
    }
    const history = await listHistory('alice', 2026, 2);
    expect(history.totalCents).toBe('60');
    expect(history.months[0]?.totalCents).toBe('60');
    expect(history.months[0]?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'income', amountCents: '60' }),
      expect.objectContaining({ category: 'return_of_capital', amountCents: '35' }),
    ]));
    // Basis returned before the sale raises that sale's realized gain by 35 cents.
    expect(data.get(holdings)?.[0]?.realizedPnlCents).toBe(95n);
    expect((await listAgenda('alice', new Date('2026-01-01'), new Date('2026-01-31'))).items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: capital.id, status: 'paid' })]));
  });

  it('syncs provider records once, ignores duplicates, and leaves data intact on upstream failure', async () => {
    await expect(syncFiiDividends('bob', portfolioId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ dividends: [
      { symbol: 'HGLG11', label: 'RENDIMENTO', exDate: '2026-03-10', paymentDate: '2026-04-10', rate: 0.11 },
      { symbol: 'HGLG11', label: 'RENDIMENTO', exDate: '2026-02-30', paymentDate: '2026-04-10', rate: 0.11 },
      { symbol: 'HGLG11', label: 'RENDIMENTO', exDate: '2026-05-10', paymentDate: '2026-06-10', rate: 0.105 },
    ] }), { status: 200 }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetcher);
    expect(await syncFiiDividends('alice', portfolioId)).toEqual({ created: 1, skipped: 2, failed: 0 });
    expect(await syncFiiDividends('alice', portfolioId)).toEqual({ created: 0, skipped: 3, failed: 0 });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Skipped unsupported rate'));
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('brapi.dev/api/v2/fii/dividends?symbols=HGLG11'),
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }));
    fetcher.mockRejectedValueOnce(new Error('upstream unavailable'));
    expect(await syncFiiDividends('alice', portfolioId)).toEqual({ created: 0, skipped: 0, failed: 1 });
    expect(data.get(dividends)).toEqual([expect.objectContaining({ source: 'provider', status: 'expected' })]);
    warning.mockRestore();
  });

  it('pins USD receipts to supplied historical FX, rounds aggregate once and rereads BRL totals', async () => {
    data.get(assets)![0]!.currency = 'USD';
    for (const trade of data.get(transactions)!) {
      trade.qty = 3n;
      trade.currency = 'USD';
      trade.fxRateToBRL = 1_000_000n;
    }
    const dividend = await createDividend('alice', { ...input, kind: 'dividend', rateCentsPerUnit: 1n });
    expect(dividend).toMatchObject({ currency: 'USD', amountCurrency: 'USD',
      nativeAmountCents: '3', amountCents: '3', amountCentsBRL: null });
    await updateDividend('alice', dividend.id, { status: 'confirmed' });
    await expect(updateDividend('bob', dividend.id, { status: 'paid', fxRateToBRL: 1_500_000n }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(updateDividend('alice', dividend.id, { status: 'paid' }))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateDividend('alice', dividend.id, { status: 'paid', fxRateToBRL: 0n }))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    expect(data.get(transactions)?.filter((row) => row.dividendId === dividend.id)).toHaveLength(0);
    expect(data.get(dividends)?.[0]?.status).toBe('confirmed');
    const paid = await updateDividend('alice', dividend.id, { status: 'paid', fxRateToBRL: 1_500_000n });
    expect(paid).toMatchObject({ currency: 'USD', amountCurrency: 'BRL', nativeAmountCents: '3',
      amountCents: '5', amountCentsBRL: '5' });
    expect(data.get(transactions)?.find((row) => row.dividendId === dividend.id))
      .toMatchObject({ currency: 'USD', qty: 3n, unitPriceCents: 1n, fxRateToBRL: 1_500_000n });
    expect((await listHistory('alice', 2026, 2)).totalCents).toBe('5');
    expect((await listAgenda('alice', new Date('2026-01-01'), new Date('2026-01-31'))).items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: dividend.id, amountCentsBRL: '5' })]));
    await expect(updateDividend('alice', dividend.id, { status: 'paid', fxRateToBRL: 2_000_000n }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    expect(data.get(transactions)?.filter((row) => row.dividendId === dividend.id)).toHaveLength(1);
  });

  it('posts USD JCP and capital return at aggregate FX without including capital return in income', async () => {
    data.get(assets)![0]!.currency = 'USD';
    for (const trade of data.get(transactions)!) {
      trade.qty = 3n; trade.currency = 'USD'; trade.fxRateToBRL = 1_000_000n;
    }
    for (const kind of ['jcp', 'amortizacao'] as const) {
      const created = await createDividend('alice', { ...input, kind, rateCentsPerUnit: 1n });
      await updateDividend('alice', created.id, { status: 'confirmed' });
      expect(await updateDividend('alice', created.id, { status: 'paid', fxRateToBRL: 1_500_000n }))
        .toMatchObject({ amountCentsBRL: '5' });
    }
    const history = await listHistory('alice', 2026, 2);
    expect(history.totalCents).toBe('5');
    expect(history.months[0]?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'income', amountCentsBRL: '5' }),
      expect.objectContaining({ category: 'return_of_capital', amountCentsBRL: '5' }),
    ]));
    expect(data.get(transactions)?.filter((row) => row.dividendId).map((row) => row.type))
      .toEqual(['jcp', 'amortizacao']);
  });

  it('aggregates mixed USD and BRL paid history exclusively in BRL cents', async () => {
    const usdAsset = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    data.get(assets)!.push({ id: usdAsset, symbol: 'VTI', name: 'USD asset', class: 'etf_us', currency: 'USD' });
    data.get(transactions)!.push({ ...entitlement, id: 'usd-buy', assetId: usdAsset,
      qty: 3n, unitPriceCents: 100n, currency: 'USD', fxRateToBRL: 1_000_000n });
    for (const [id, rate] of [[assetId, 10n], [usdAsset, 1n]] as const) {
      const dividend = await createDividend('alice', { ...input, assetId: id, rateCentsPerUnit: rate });
      await updateDividend('alice', dividend.id, { status: 'confirmed' });
      await updateDividend('alice', dividend.id, { status: 'paid',
        ...(id === usdAsset ? { fxRateToBRL: 1_500_000n } : {}) });
    }
    const history = await listHistory('alice', 2026, 2);
    expect(history.totalCents).toBe('55');
    expect(history.months[0]?.totalCents).toBe('55');
    expect(history.months[0]?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ amountCents: '50', amountCurrency: 'BRL' }),
      expect.objectContaining({ amountCents: '5', nativeAmountCents: '3', amountCurrency: 'BRL' }),
    ]));
  });

  it('ignores forged public notes and blocks PATCH/DELETE on linked receipts via real routes', async () => {
    const dividend = await createDividend('alice', input);
    const headers = { Cookie: `session=${createSessionToken('alice')}`, 'Content-Type': 'application/json' };
    const forged = await app.request('/api/v1/transactions', { method: 'POST', headers,
      body: JSON.stringify({ accountId, assetId, type: 'dividend', date: '2026-02-01',
        qty: '1', unitPriceCents: '1', notes: `dividend:${dividend.id}`, dividendId: dividend.id }) });
    expect(forged.status).toBe(201);
    const forgedRow = await forged.json() as { id: string; dividendId?: string | null };
    expect(forgedRow.dividendId).toBeFalsy();
    const pending = await listAgenda('alice', new Date('2026-01-01'), new Date('2026-01-31'));
    expect(pending.items[0]?.status).toBe('expected');
    await updateDividend('alice', dividend.id, { status: 'confirmed' });
    await updateDividend('alice', dividend.id, { status: 'paid' });
    const receipt = data.get(transactions)?.find((row) => row.dividendId === dividend.id);
    expect(receipt).toMatchObject({ dividendId: dividend.id });
    const mutation = await app.request(`/api/v1/transactions/${receipt!.id}`, { method: 'PATCH', headers,
      body: JSON.stringify({ notes: null, feeCents: 0, fxRateToBRL: null }) });
    expect(mutation.status).toBe(409);
    expect(await mutation.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    const deletion = await app.request(`/api/v1/transactions/${receipt!.id}`, { method: 'DELETE', headers });
    expect(deletion.status).toBe(409);
    expect(data.get(transactions)?.some((row) => row.id === receipt!.id)).toBe(true);
    expect((await listHistory('alice', 2026, 2)).totalCents).toBe('60');
    // A user's unlinked entry remains mutable and never contributes to dividend receipts.
    expect((await app.request(`/api/v1/transactions/${forgedRow.id}`, { method: 'PATCH', headers,
      body: JSON.stringify({ notes: 'edited' }) })).status).toBe(200);
  });

  it('does not count legacy note-only paid records and reports incomplete totals', async () => {
    const dividend = await createDividend('alice', input);
    data.get(dividends)![0]!.status = 'paid';
    data.get(transactions)!.push({ ...entitlement, id: 'legacy-note', type: 'dividend',
      date: paymentDate, notes: `dividend:${dividend.id}` });
    const history = await listHistory('alice', 2026, 2);
    expect(history).toMatchObject({ totalCents: '0', totalsIncomplete: true,
      months: [expect.objectContaining({ totalsIncomplete: true,
        items: [expect.objectContaining({ reconciliationRequired: true, amountCentsBRL: null })] })] });
  });

  it('takes journal account locks in stable id order for unsorted account queries', async () => {
    const first = '11111111-1111-4111-8111-111111111111';
    const last = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    data.set(accounts, [{ id: last, portfolioId, userId: 'alice' },
      { id: accountId, portfolioId, userId: 'alice' }, { id: first, portfolioId, userId: 'alice' }]);
    data.get(transactions)!.push({ ...entitlement, id: 'first-buy', accountId: first });
    data.get(transactions)!.push({ ...entitlement, id: 'last-buy', accountId: last });
    const dividend = await createDividend('alice', input);
    await updateDividend('alice', dividend.id, { status: 'confirmed' });
    await updateDividend('alice', dividend.id, { status: 'paid' });
    expect(journalLocks).toEqual([first, accountId, last].map((id) => `journal:alice:${id}`));
  });
});
