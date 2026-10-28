import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNota } from '../src/services/import/nota-parser.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('TASK-08 representative Sinacor-shaped fixtures and safe rejection', () => {
  it('parses two VISTA trades and reconciles their declared operation and fee totals in text', () => {
    const source = fixture('nota-sinacor-vista.txt');
    const nota = parseNota(source, 'text');
    expect(nota).toMatchObject({ broker: 'XP', notaNumber: '2026-984', tradeDate: '2026-10-18',
      items: [{ symbol: 'PETR4', qty: 2n, dayTrade: true }, { symbol: 'VALE3', qty: 1n, dayTrade: false }],
      fees: { liquidacao: 2n, corretagem: 3n, emolumentos: 1n, iss: 0n, irrf: 0n } });
    expect(() => parseNota(source.replace('31,50', '31,51'), 'text')).toThrow(/Total dos negócios/);
    expect(() => parseNota(source.replace('Emolumentos: 0,01', 'Custos extras: 0,01'), 'text')).toThrow(/Taxa não reconhecida/);
    expect(() => parseNota(source.replace('2-BOVESPA C VISTA', '2-BOVESPA V TERMO'), 'text')).toThrow(/não reconhecido/);
    expect(() => parseNota(source.replace('2-BOVESPA C VISTA VALE3 1 10,50 10,50', 'VALE3 1 10,50'), 'text'))
      .toThrow(/Registro financeiro não reconhecido/);
    expect(() => parseNota(source.replace('Negócios realizados\n', '').replace('2-BOVESPA C VISTA VALE3 1 10,50 10,50', 'VALE3 1 10,50'), 'text'))
      .toThrow(/Registro financeiro não reconhecido/);
    expect(() => parseNota(source.replace('Emolumentos: 0,01', 'Encargos adicionais: 0,01'), 'text'))
      .toThrow(/não reconhecida/);
  });

  it('parses Sinacor XML trades and rejects unknown records or mismatched declared totals', () => {
    const source = fixture('nota-sinacor-vista.xml');
    const nota = parseNota(source, 'xml');
    expect(nota.items.map((item) => item.symbol)).toEqual(['PETR4', 'VALE3']);
    expect(nota.fees).toMatchObject({ liquidacao: 2n, corretagem: 3n, emolumentos: 1n });
    expect(() => parseNota(source.replace('totalNegocios>31,50', 'totalNegocios>31,51'), 'xml'))
      .toThrow(/Total dos negócios/);
    expect(() => parseNota(source.replace('valorTotal>10,50', 'valorTotal>10,51'), 'xml'))
      .toThrow(/Total do negócio XML/);
    expect(() => parseNota(source.replace('</negocios>', '<trade><codigoAtivo>ITUB4</codigoAtivo></trade></negocios>'), 'xml'))
      .toThrow(/Estrutura financeira XML/);
    expect(() => parseNota(source.replace('</negocios>', '<operacao><codigoAtivo>ITUB4</codigoAtivo></negocios>'), 'xml'))
      .toThrow(/Estrutura financeira XML/);
    expect(() => parseNota(source.replace('</negocios>', '<despesas>1,00</despesas></negocios>'), 'xml'))
      .toThrow(/Estrutura financeira XML/);
    expect(() => parseNota(source.replace('</negocios>', '<encargosAdicionais>1,00</encargosAdicionais></negocios>'), 'xml'))
      .toThrow(/Campo XML não suportado/);
  });

  it('rejects unsupported CSV financial columns rather than silently dropping their amounts', () => {
    const csv = 'broker,notaNumber,tradeDate,direction,symbol,qty,unitPrice,brokerFee\nXP,123,2026-10-18,C,PETR4,2,10.50,1.00';
    expect(() => parseNota(csv, 'csv')).toThrow(/Coluna financeira CSV/);
  });
});
