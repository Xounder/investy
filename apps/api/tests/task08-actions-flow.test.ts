import { describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { accounts, assets, brokers, holdings, notaimports, transactions } from '../src/db/schema.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder, session } = vi.hoisted(() => ({ holder: { db: null as unknown }, session: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: session } }));
type Row = Record<string, unknown>;
const rows = new Map<unknown, Row[]>();
class Query {
  private table: unknown;
  private whereParts: { columns: string[]; values: unknown[] } = { columns: [], values: [] };
  private input: Row = {};
  private max = Infinity;
  constructor(private mode: 'select' | 'insert' | 'update' | 'delete', table?: unknown) { this.table = table; }
  from(table: unknown) { this.table = table; return this; }
  where(condition: unknown) { this.whereParts = whereFacts(condition); return this; }
  orderBy() { return this; }
  limit(n: number) { this.max = n; return this; }
  values(input: Row) { this.input = input; return this; }
  set(input: Row) { this.input = input; return this; }
  returning() { return Promise.resolve(this.run()); }
  then<T>(resolve: (rows: Row[]) => T, reject?: (error: unknown) => unknown) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject);
  }
  private run(): Row[] {
    if (this.mode === 'insert') {
      const row = { createdAt: new Date(), ...this.input };
      rows.set(this.table, [...(rows.get(this.table) ?? []), row]);
      return [row];
    }
    const matches = (rows.get(this.table) ?? []).filter((row) => this.whereParts.columns.every((column, index) => {
      const actual = row[column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())];
      const expected = this.whereParts.values[index];
      if (Array.isArray(expected)) return expected.includes(actual);
      return actual instanceof Date && expected instanceof Date ? actual.getTime() === expected.getTime() : actual === expected;
    }));
    if (this.mode === 'update') { matches.forEach((row) => Object.assign(row, this.input)); return matches; }
    if (this.mode === 'delete') { rows.set(this.table, (rows.get(this.table) ?? []).filter((row) => !matches.includes(row))); return matches; }
    return matches.slice(0, this.max);
  }
}
interface DbDouble {
  select: () => Query; insert: (table: unknown) => Query; update: (table: unknown) => Query;
  delete: (table: unknown) => Query; execute: () => Promise<undefined>;
  transaction: <T>(callback: (tx: DbDouble) => Promise<T>) => Promise<T>;
}
const db: DbDouble = {
  select: () => new Query('select'), insert: (table) => new Query('insert', table),
  update: (table) => new Query('update', table), delete: (table) => new Query('delete', table),
  execute: async () => undefined, transaction: async (callback) => callback(db),
};
holder.db = db;

const brokerId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const assetId = '00000000-0000-4000-8000-000000000003';
function request(path: string, body: FormData | object) {
  return app.request(`/api/v1/transactions/import/nota/${path}`, {
    method: 'POST', headers: { Cookie: `session=${createSessionToken('alice')}`,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

describe('TASK-08 corporate events through actual preview, confirm and journal replay', () => {
  it('writes buy, split and JCP as separate events; replay adjusts qty/cost and realizes JCP income', async () => {
    rows.clear();
    session.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
    rows.set(brokers, [{ id: brokerId, name: 'XP' }]);
    rows.set(accounts, [{ id: accountId, brokerId, userId: 'alice', portfolioId: 'portfolio', name: 'Conta' }]);
    rows.set(assets, [{ id: assetId, symbol: 'PETR4', currency: 'BRL' }]);
    rows.set(transactions, []); rows.set(holdings, []); rows.set(notaimports, []);
    const text = 'Corretora: XP\nNúmero Nota: 984\nData Pregão: 18/10/2026\nNegócios realizados\n' +
      '1-BOVESPA C VISTA PETR4 2 10,50 21,00\nSPLIT PETR4 2\nJCP PETR4 2 0,15\n' +
      'Resumo financeiro\nCorretagem: 0,03\nTotal Negócios: 21,00\nTotal de Taxas: 0,03';
    const form = new FormData();
    form.set('file', new File([text], 'nota.txt'));
    const response = await request('preview', form);
    expect(response.status).toBe(200);
    const { nota } = await response.json() as { nota: { importToken: string; rateio: string[]; warnings: unknown[] } };
    expect(nota).toMatchObject({ rateio: ['3', '0', '0'], warnings: [] });
    const confirmed = await request('confirm', { importToken: nota.importToken });
    expect(confirmed.status).toBe(201);
    expect(await confirmed.json()).toMatchObject({ created: 3,
      holdings: [{ qty: '4', costBasisCents: '2103', realizedPnlCents: '30' }] });
    expect(rows.get(transactions)?.map((row) => row.type)).toEqual(['buy', 'split', 'jcp']);
    expect(rows.get(transactions)?.map((row) => row.feeCents)).toEqual([3n, 0n, 0n]);
    expect(rows.get(transactions)?.[1]).toMatchObject({ factor: 2, notaRefId: rows.get(notaimports)?.[0]?.id });
    expect(rows.get(transactions)?.[2]).toMatchObject({ unitPriceCents: 15n, qty: 2n });
  });
});
