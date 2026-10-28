import { describe, expect, it } from 'vitest';
import { parseNota } from '../src/services/import/nota-parser.js';
import { boundedMultipart } from '../src/services/import/multipart.js';
import type { Context } from 'hono';

async function form(extraBytes: number, headerLength?: string): Promise<Context> {
  const data = new FormData();
  data.set('file', new File(['ok'], 'small.csv'));
  data.set('extra', 'x'.repeat(extraBytes));
  const request = new Request('http://localhost/import', { method: 'POST', body: data });
  const contentType = request.headers.get('content-type')!;
  const raw = new Request('http://localhost/import', { method: 'POST', body: await request.arrayBuffer(),
    headers: { 'content-type': contentType, ...(headerLength ? { 'content-length': headerLength } : {}) } });
  return { req: { raw, url: raw.url, header: (name: string) => raw.headers.get(name) ?? undefined } } as Context;
}

describe('TASK-08 lossless import and multipart bounds', () => {
  it('rejects the complete multipart body when extra parts exceed the bound, despite missing/spoofed length', async () => {
    await expect(boundedMultipart(await form(1600), 1000)).rejects.toMatchObject({ status: 413 });
    await expect(boundedMultipart(await form(1600, '100'), 1000)).rejects.toMatchObject({ status: 413 });
    await expect(boundedMultipart(await form(1, '2000'), 1000)).rejects.toMatchObject({ status: 413 });
    expect((await boundedMultipart(await form(1), 1000)).get('file')).toBeInstanceOf(File);
  });

  it('rejects text notes with a malformed trade, malformed fee or incompatible declared total', () => {
    const base = 'Corretora: XP\nNúmero Nota: 123\nData Pregão: 18/10/2026\nC PETR4 2 10,50\nCorretagem: 0,03';
    expect(() => parseNota(`${base}\nV VALE3 10 ???`, 'text')).toThrow(/Negócio não reconhecido/);
    expect(() => parseNota(`${base}\nISS: inválido`, 'text')).toThrow(/Valor monetário inválido/);
    expect(() => parseNota(`${base}\nTaxas extraordinárias: 1,00`, 'text')).toThrow(/Taxa não reconhecida/);
    expect(() => parseNota(`${base}\nTotal de Taxas: 0,04`, 'text')).toThrow(/divergente/);
    expect(parseNota(`${base}\nISS: 0,02\nTotal de Taxas: 0,05`, 'text').fees.iss).toBe(2n);
  });

  it('sums per-operation fees across CSV rows and rejects mixed notes/incorrect declared fee total', () => {
    const header = 'broker,notaNumber,tradeDate,direction,symbol,qty,unitPrice,corretagem,iss,totalFees';
    const first = 'XP,123,2026-10-18,C,PETR4,1,10.00,0.03,0.01,0.06';
    const second = 'XP,123,2026-10-18,C,VALE3,1,20.00,0.02,,0.06';
    const parsed = parseNota(`${header}\n${first}\n${second}`, 'csv');
    expect(parsed.fees).toMatchObject({ corretagem: 5n, iss: 1n });
    expect(() => parseNota(`${header}\n${first}\n${second.replace('0.02', '0.03')}`, 'csv')).toThrow(/divergente/);
    expect(parseNota(`${header}\n${first}\n${second.replace('2026-10-18', '2026-10-19')}`, 'csv').items[1]?.tradeDate).toBe('2026-10-19');
    expect(() => parseNota(`${header}\n${first}\n${second.replace('20.00', 'bad')}`, 'csv')).toThrow(/Valor monetário inválido/);
  });

  it('maps a supported Sinacor VISTA line, validates its declared total, and surfaces split/JCP events', () => {
    const text = 'Corretora: XP\nNumero Nota: 123\nData Pregao: 18/10/2026\n1-BOVESPA C VISTA PETR4 2 10,50 21,00 D\nSPLIT PETR4 2\nJCP PETR4 2 0,15\nCorretagem: 0,03';
    const parsed = parseNota(text, 'text');
    expect(parsed.items).toMatchObject([
      { direction: 'C', symbol: 'PETR4', qty: 2n, dayTrade: true },
      { type: 'split', factor: 2, symbol: 'PETR4' },
      { type: 'jcp', unitPriceCents: 15n },
    ]);
    expect(() => parseNota(text.replace('21,00', '22,00'), 'text')).toThrow(/Total do negócio/);
    expect(() => parseNota(text.replace('VISTA', 'TERMO'), 'text')).toThrow(/não reconhecido/);
  });

  it('maps Sinacor-style XML aliases and action events; rejects unrecognized fee tags', () => {
    const xml = '<notaCorretagem><corretora>XP</corretora><numero>123</numero><dataPregao>2026-10-18</dataPregao>' +
      '<operacao><compraVenda>C</compraVenda><codigoAtivo>PETR4</codigoAtivo><quantidade>2</quantidade><precoUnitario>10,50</precoUnitario></operacao>' +
      '<evento><eventoTipo>desdobramento</eventoTipo><codigoAtivo>PETR4</codigoAtivo><fator>2</fator></evento>' +
      '<taxaLiquidacao>0,02</taxaLiquidacao><totalTaxas>0,02</totalTaxas></notaCorretagem>';
    const parsed = parseNota(xml, 'xml');
    expect(parsed.items).toMatchObject([{ qty: 2n, symbol: 'PETR4' }, { type: 'split', factor: 2 }]);
    expect(parsed.fees.liquidacao).toBe(2n);
    expect(() => parseNota(xml.replace('totalTaxas>0,02', 'totalTaxas>0,03'), 'xml')).toThrow(/divergente/);
    expect(() => parseNota(xml.replace('<totalTaxas>', '<taxaSurpresa>1</taxaSurpresa><totalTaxas>'), 'xml')).toThrow(/não reconhecida/);
  });
});
