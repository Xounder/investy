import { describe, expect, it } from 'vitest';
import { parseCsv, decodeCsv } from '../src/services/import/csv-parser.js';
import { parseNota } from '../src/services/import/nota-parser.js';
import { allocateNotaFees } from '../src/services/import/rateio.js';

describe('TASK-08 CSV import', () => {
  const header = 'type,date,account,symbol,qty,unitPriceCents,feeCents';
  it('parses a valid journal row with cents', () => {
    const parsed = parseCsv(`${header}\nbuy,2026-01-15,Conta,PETR4,2,1500,10`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ type: 'buy', symbol: 'PETR4', qty: 2n, unitPriceCents: 1500n, feeCents: 10n });
  });
  it('reports invalid rows without dropping the other rows', () => {
    const parsed = parseCsv(`${header}\nbuy,2026-01-15,Conta,PETR4,2,1500,10\nother,2026-02-30,,VALE3,-2,0,0`);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([expect.objectContaining({ line: 3 })]);
  });
  it('rejects empty input and decodes latin1 fallback', () => {
    expect(parseCsv(`${header}\n`).errors).toHaveLength(1);
    expect(decodeCsv(new Uint8Array([0xe7]))).toBe('ç');
  });
});

describe('TASK-08 nota import', () => {
  const text = 'Corretora: XP\nNúmero Nota: 123\nData Pregão: 18/10/2026\nC PETR4 2 10,50 D\nV VALE3 1 20,00\nCorretagem: 1,01\nISS: 0,02';
  it('parses a text-extracted nota with fee block and day trade', () => {
    const nota = parseNota(text, 'text');
    expect(nota).toMatchObject({ broker: 'XP', notaNumber: '123', tradeDate: '2026-10-18' });
    expect(nota.items[0]).toMatchObject({ direction: 'C', qty: 2n, unitPriceCents: 1050n, dayTrade: true });
    expect(nota.fees.corretagem).toBe(101n);
    expect(nota.fees.iss).toBe(2n);
  });
  it('parses CSV header and multiple operations', () => {
    const nota = parseNota('broker,notaNumber,tradeDate,direction,symbol,qty,unitPrice,dayTrade,corretagem\nXP,123,2026-10-18,C,PETR4,1,10.50,sim,0.03\nXP,123,2026-10-18,V,VALE3,2,20.00,não,', 'csv');
    expect(nota.items.map((i) => i.dayTrade)).toEqual([true, false]);
    expect(nota.fees.corretagem).toBe(3n);
  });
  it('parses XML and rejects entities', () => {
    const xml = '<nota><broker>XP</broker><notaNumber>123</notaNumber><tradeDate>2026-10-18</tradeDate><negocio><direction>C</direction><symbol>PETR4</symbol><qty>1</qty><unitPrice>10,00</unitPrice></negocio><iss>0,01</iss></nota>';
    expect(parseNota(xml, 'xml').items[0]?.unitPriceCents).toBe(1000n);
    expect(() => parseNota('<!DOCTYPE nota>' + xml, 'xml')).toThrow();
  });
  it('allocates exactly, including one operation, and rejects unsafe magnitudes', () => {
    expect(allocateNotaFees(5n, [1n, 1n, 1n])).toEqual([2n, 2n, 1n]);
    expect(allocateNotaFees(103n, [100n])).toEqual([103n]);
    expect(() => allocateNotaFees(BigInt(Number.MAX_SAFE_INTEGER) + 1n, [1n])).toThrow();
  });
});
