import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { accounts, assets, brokers, holdings, notaimports, transactions } from '../src/db/schema.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder, session } = vi.hoisted(() => ({ holder: { db: null as unknown }, session: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: session } }));

type Row = Record<string, unknown>;
const rows = new Map<unknown, Row[]>();
const predicates: Array<{ table: unknown; columns: string[]; values: unknown[] }> = [];
let failHolding = false;
let transactionsStarted = 0;
const fieldName = (column: string) => column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

class Query {
  private table: unknown;
  private condition: { columns: string[]; values: unknown[] } = { columns: [], values: [] };
  private payload: Row = {};
  private max = Infinity;
  private sorted = false;
  constructor(private mode: 'select' | 'insert' | 'update' | 'delete', table?: unknown) { this.table = table; }
  from(table: unknown) { this.table = table; return this; }
  where(sql: unknown) { this.condition = whereFacts(sql); predicates.push({ table: this.table, ...this.condition }); return this; }
  orderBy() { this.sorted = true; return this; }
  limit(n: number) { this.max = n; return this; }
  values(payload: Row) { this.payload = payload; return this; }
  set(payload: Row) { this.payload = payload; return this; }
  returning() { return Promise.resolve(this.run()); }
  then<T>(resolve: (value: Row[]) => T, reject?: (reason: unknown) => unknown) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject);
  }
  private matching() {
    return (rows.get(this.table) ?? []).filter((row) => this.condition.columns.every((column, index) => {
      const actual = row[fieldName(column)];
      const expected = this.condition.values[index];
      if (Array.isArray(expected)) return expected.includes(actual);
      return actual instanceof Date && expected instanceof Date ? actual.getTime() === expected.getTime() : actual === expected;
    }));
  }
  private run(): Row[] {
    if (failHolding && this.table === holdings && this.mode === 'insert') throw new Error('holding recompute failed');
    if (this.mode === 'insert') {
      const row = { createdAt: new Date(), ...this.payload };
      rows.set(this.table, [...(rows.get(this.table) ?? []), row]);
      return [row];
    }
    const matching = this.matching();
    if (this.mode === 'update') { matching.forEach((row) => Object.assign(row, this.payload)); return matching; }
    if (this.mode === 'delete') { rows.set(this.table, (rows.get(this.table) ?? []).filter((r) => !matching.includes(r))); return matching; }
    const sorted = this.sorted && this.table === transactions ? [...matching].sort((a, b) =>
      (a.date as Date).getTime() - (b.date as Date).getTime()) : matching;
    return sorted.slice(0, this.max);
  }
}
interface DbDouble {
  select: () => Query;
  insert: (table: unknown) => Query;
  update: (table: unknown) => Query;
  delete: (table: unknown) => Query;
  execute: () => Promise<undefined>;
  transaction: <T>(fn: (tx: DbDouble) => Promise<T>) => Promise<T>;
}
const db: DbDouble = {
  select: () => new Query('select'), insert: (table: unknown) => new Query('insert', table),
  update: (table: unknown) => new Query('update', table), delete: (table: unknown) => new Query('delete', table),
  execute: async () => undefined,
  transaction: async <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> => {
    transactionsStarted++;
    const snapshot = new Map([...rows].map(([table, data]) => [table, data.map((row) => ({ ...row }))]));
    try { return await fn(db); } catch (error) {
      rows.clear(); for (const [table, data] of snapshot) rows.set(table, data);
      throw error;
    }
  },
};
holder.db = db;

const brokerId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const portfolioId = '00000000-0000-4000-8000-000000000003';
const assetId = '00000000-0000-4000-8000-000000000004';
const csv = 'type,date,account,symbol,qty,unitPriceCents,feeCents\nbuy,2026-10-18,Investimentos,PETR4,2,1050,3';
const notaText = 'Corretora: XP\nNúmero Nota: 456\nData Pregão: 18/10/2026\nC PETR4 2 10,50 D\nCorretagem: 0,03';

function request(user: string, path: string, method = 'GET', body?: FormData | object) {
  return app.request(`/api/v1/transactions/import${path}`, { method,
    headers: { Cookie: `session=${createSessionToken(user)}`, ...((body && !(body instanceof FormData)) ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
}
function upload(text: string, filename: string, extra?: Record<string, string>) {
  const form = new FormData();
  form.set('file', new File([text], filename, { type: 'text/plain' }));
  for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
  return form;
}
async function preview(user = 'alice', text = notaText) {
  return request(user, '/nota/preview', 'POST', upload(text, 'nota.txt'));
}
async function token(text = notaText) {
  const response = await preview('alice', text);
  expect(response.status).toBe(200);
  return (await response.json() as { nota: { importToken: string; warnings: Array<{ type: string }> } }).nota;
}

/** Valid one-page text PDF; xref offsets are computed from the actual ASCII bytes. */
function textPdf(lines: string[]): Uint8Array {
  const content = `BT /F1 12 Tf 50 750 Td ${lines.map((line, index) =>
    `${index ? '0 -20 Td ' : ''}(${line}) Tj`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

beforeEach(() => {
  rows.clear(); predicates.length = 0; transactionsStarted = 0; failHolding = false;
  session.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  rows.set(accounts, [{ id: accountId, userId: 'alice', portfolioId, brokerId, name: 'Investimentos' }]);
  rows.set(brokers, [{ id: brokerId, name: 'XP' }]);
  rows.set(assets, [{ id: assetId, symbol: 'PETR4', currency: 'BRL' }]);
  rows.set(transactions, []); rows.set(holdings, []); rows.set(notaimports, []);
});
afterEach(() => vi.restoreAllMocks());

describe('TASK-08 real app/service import flow (DB boundary double)', () => {
  it('validates multipart, owner-scoped account, missing asset and CSV row errors without partial writes', async () => {
    expect((await request('alice', '/csv', 'POST', {})).status).toBe(400);
    expect((await request('alice', '/csv', 'POST', upload('', 'empty.csv'))).status).toBe(400);
    const invalid = await request('alice', '/csv', 'POST', upload(csv + '\nbuy,2026-02-30,Investimentos,PETR4,1,100,0', 'trades.csv'));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ created: 0, errors: [{ line: 3 }] });
    expect((await request('bob', '/csv', 'POST', upload(csv, 'trades.csv'))).status).toBe(400);
    expect((await request('alice', '/csv', 'POST', upload(csv.replace('PETR4', 'MISSING'), 'trades.csv'))).status).toBe(400);
    expect((await request('alice', '/nota/preview', 'POST', {})).status).toBe(400);
    expect((await request('bob', '/nota/preview', 'POST', upload(notaText, 'nota.txt'))).status).toBe(400);
    expect(rows.get(transactions)).toHaveLength(0);
    expect(transactionsStarted).toBe(0);
  });

  it('imports CSV in one transaction and rolls back all rows on holding failure', async () => {
    const twoRows = csv + '\nbuy,2026-10-18,Investimentos,PETR4,1,1000,2';
    const result = await request('alice', '/csv', 'POST', upload(twoRows, 'trades.csv'));
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ created: 2, errors: [] });
    expect(transactionsStarted).toBe(1);
    expect(rows.get(transactions)).toHaveLength(2);
    expect(rows.get(holdings)?.[0]).toMatchObject({ qty: 3n, costBasisCents: 3105n });
    rows.set(transactions, []); rows.set(holdings, []); failHolding = true;
    expect((await request('alice', '/csv', 'POST', upload(twoRows, 'trades.csv'))).status).toBe(500);
    expect(rows.get(transactions)).toHaveLength(0);
    expect(rows.get(holdings)).toHaveLength(0);
  });

  it('previews allocated cents and confirms journal, nota reference and owner-only history', async () => {
    const nota = await token();
    expect(nota).toMatchObject({ warnings: [], rateio: ['3'], items: [{ qty: '2', dayTrade: true }] });
    const confirmed = await request('alice', '/nota/confirm', 'POST', { importToken: nota.importToken });
    expect(confirmed.status).toBe(201);
    expect(await confirmed.json()).toMatchObject({ created: 1, holdings: [{ qty: '2', costBasisCents: '2103' }] });
    expect(transactionsStarted).toBe(1);
    expect(rows.get(transactions)?.[0]).toMatchObject({ feeCents: 3n, source: 'nota', notes: 'Day trade', notaRefId: rows.get(notaimports)?.[0]?.id });
    expect(rows.get(notaimports)?.[0]).toMatchObject({ userId: 'alice', status: 'confirmed', notaNumber: '456' });
    expect(await (await request('alice', '/nota/history')).json()).toMatchObject({ items: [{ notaNumber: '456' }] });
    expect(await (await request('bob', '/nota/history')).json()).toEqual({ items: [] });
    expect(predicates.filter((p) => p.table === notaimports).every((p) => p.columns.includes('user_id'))).toBe(true);
  });

  it('blocks duplicate and reconciliation on confirm with 409, including changed catalog after preview', async () => {
    const first = await token();
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: first.importToken })).status).toBe(201);
    const duplicate = await token();
    expect(duplicate.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'DUPLICATE' })]));
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: duplicate.importToken })).status).toBe(409);
    expect(rows.get(notaimports)).toHaveLength(1);
    const changed = await token(notaText.replace('456', '457'));
    rows.set(assets, []);
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: changed.importToken })).status).toBe(409);
    expect(rows.get(transactions)).toHaveLength(1);
  });

  it('warns about unknown assets and mismatched negócio dates and refuses both at confirm', async () => {
    const unknown = await token(notaText.replace('PETR4', 'OTHER').replace('456', '470'));
    expect(unknown.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'UNKNOWN_ASSET', details: 'OTHER' })]));
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: unknown.importToken })).status).toBe(409);
    const datedCsv = 'broker,notaNumber,tradeDate,direction,symbol,qty,unitPrice,corretagem\nXP,471,2026-10-18,C,PETR4,1,10.50,0.03\nXP,471,2026-10-19,C,PETR4,1,10.50,';
    const response = await request('alice', '/nota/preview', 'POST', upload(datedCsv, 'nota.csv'));
    expect(response.status).toBe(200);
    const { nota } = await response.json() as { nota: { warnings: Array<{ type: string }>; importToken: string } };
    expect(nota.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'DATE_MISMATCH' })]));
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: nota.importToken })).status).toBe(409);
    expect(rows.get(transactions)).toHaveLength(0);
  });

  it('rejects cross-owner, consumed and expired tokens without writing', async () => {
    const owned = await token(notaText.replace('456', '458'));
    expect((await request('bob', '/nota/confirm', 'POST', { importToken: owned.importToken })).status).toBe(400);
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: owned.importToken })).status).toBe(201);
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: owned.importToken })).status).toBe(400);
    const expired = await token(notaText.replace('456', '459'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: expired.importToken })).status).toBe(400);
    expect(rows.get(transactions)).toHaveLength(1);
  });

  it('rolls back both nota record and journal on recompute failure', async () => {
    const nota = await token(notaText.replace('456', '460'));
    failHolding = true;
    expect((await request('alice', '/nota/confirm', 'POST', { importToken: nota.importToken })).status).toBe(500);
    expect(transactionsStarted).toBe(1);
    expect(rows.get(notaimports)).toHaveLength(0);
    expect(rows.get(transactions)).toHaveLength(0);
  });

  it('extracts genuine server-side PDF text through pdf-parse and previews the nota', async () => {
    const pdf = textPdf(['Corretora: XP', 'Numero Nota: 462', 'Data Pregao: 18/10/2026',
      'C PETR4 2 10.50', 'Corretagem: 0.03']);
    const form = new FormData();
    form.set('file', new File([pdf], 'nota.pdf', { type: 'application/pdf' }));
    const response = await request('alice', '/nota/preview', 'POST', form);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ nota: {
      notaNumber: '462', items: [{ symbol: 'PETR4', qty: '2' }], fees: { corretagem: '3' },
    } });
  });
});
