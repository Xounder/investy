import { z } from 'zod';
import type { TransactionType } from '@investy/domain';

export interface CsvRow {
  line: number;
  type: TransactionType;
  date: Date;
  account: string;
  symbol: string;
  qty: bigint;
  unitPriceCents: bigint;
  feeCents: bigint;
  fxRateToBRL?: bigint;
}

export interface CsvError { line: number; message: string }

const kinds = z.enum(['buy', 'sell', 'opening', 'adjustment', 'dividend', 'jcp', 'amortizacao']);
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const integer = /^\d+$/;
const maxBigInt = 9223372036854775807n;

/** RFC 4180 quoting, CRLF and embedded newlines; rejects malformed quoting. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && cell === '' && !closed) quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; closed = false; }
    else if (char === '\n') {
      row.push(cell.replace(/\r$/, '')); rows.push(row);
      row = []; cell = ''; closed = false;
    } else if (char === '\r' && text[i + 1] === '\n') continue;
    else if (closed || char === '"') throw new Error('Malformed CSV quoting');
    else cell += char;
  }
  if (quoted) throw new Error('Unterminated CSV quoted field');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function decodeCsv(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
  catch { return new TextDecoder('windows-1252').decode(bytes).replace(/^\uFEFF/, ''); }
}

export function parseCsv(text: string): { rows: CsvRow[]; errors: CsvError[] } {
  const parsed = splitCsv(text);
  const errors: CsvError[] = [];
  const rows: CsvRow[] = [];
  if (parsed.length < 2 || parsed.slice(1).every((row) => row.every((v) => !v.trim()))) {
    return { rows, errors: [{ line: 1, message: 'No rows found' }] };
  }
  const headers = parsed[0]!.map((header) => header.trim().toLowerCase());
  const required = ['type', 'date', 'account', 'symbol', 'qty', 'unitpricecents', 'feecents'];
  if (new Set(headers).size !== headers.length || required.some((key) => !headers.includes(key))) {
    return { rows, errors: [{ line: 1, message: `Required columns: ${required.join(', ')}` }] };
  }
  for (const [index, values] of parsed.slice(1).entries()) {
    if (values.every((v) => !v.trim())) continue;
    const line = index + 2;
    if (values.length !== headers.length) { errors.push({ line, message: 'Column count mismatch' }); continue; }
    const field = (key: string) => values[headers.indexOf(key)]?.trim() ?? '';
    const kind = kinds.safeParse(field('type').toLowerCase());
    const match = datePattern.exec(field('date'));
    const date = match ? new Date(`${field('date')}T00:00:00.000Z`) : null;
    const dateValid = !!date && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === field('date');
    const qty = field('qty'), price = field('unitpricecents'), fee = field('feecents');
    const fx = headers.includes('fxratetobrl') ? field('fxratetobrl') : '';
    if (!kind.success || !dateValid || !field('account') || !field('symbol') ||
      !integer.test(qty) || BigInt(integer.test(qty) ? qty : 0) <= 0n ||
      BigInt(integer.test(qty) ? qty : 0) > maxBigInt ||
      !integer.test(price) || BigInt(integer.test(price) ? price : 0) <= 0n ||
      BigInt(integer.test(price) ? price : 0) > maxBigInt ||
      !integer.test(fee) || BigInt(integer.test(fee) ? fee : 0) > maxBigInt ||
      (fx !== '' && (!integer.test(fx) || BigInt(integer.test(fx) ? fx : 0) <= 0n || BigInt(integer.test(fx) ? fx : 0) > maxBigInt))) {
      errors.push({ line, message: 'Invalid type, date, account, symbol, positive qty/price, fee or FX rate' });
      continue;
    }
    rows.push({ line, type: kind.data, date: date!, account: field('account'),
      symbol: field('symbol').toUpperCase(), qty: BigInt(qty), unitPriceCents: BigInt(price),
      feeCents: BigInt(fee), ...(fx ? { fxRateToBRL: BigInt(fx) } : {}) });
  }
  return { rows, errors };
}
