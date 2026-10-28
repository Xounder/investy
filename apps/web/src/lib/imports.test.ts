import { afterEach, describe, expect, it, vi } from 'vitest';
import { affectedImportKeys, csvRowMessage, importApi, importError, moneyCents } from './imports';

afterEach(() => vi.unstubAllGlobals());

describe('import API boundary', () => {
  it('sends CSV file as multipart without JSON headers and returns per-row errors', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 400,
      json: async () => ({ created: 0, errors: [{ line: 3, message: 'Account not found' }] }) });
    vi.stubGlobal('fetch', fetcher);
    const file = new File(['type,date,account,symbol,qty,unitPriceCents,feeCents'], 'import.csv', { type: 'text/csv' });
    await expect(importApi.csv(file)).rejects.toMatchObject({ status: 400, errors: [{ line: 3, message: 'Account not found' }] });
    const [url, request] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/transactions/import/csv');
    expect(request.credentials).toBe('include');
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get('file')).toBe(file);
    expect(request.headers).toBeUndefined();
  });

  it('uses selected broker/account with nota preview and only token for confirmation', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ nota: { importToken: 'abc' } }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ created: 1, holdings: [{ id: 'holding-1', assetId: 'asset-1', accountId: 'account-2', qty: '12' }] }) });
    vi.stubGlobal('fetch', fetcher);
    const file = new File(['<nota/>'], 'nota.xml');
    await importApi.preview(file, 'account-2', 'broker-1');
    const form = (fetcher.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect([form.get('file'), form.get('accountId'), form.get('brokerId')]).toEqual([file, 'account-2', 'broker-1']);
    const result = await importApi.confirm('abc');
    expect(JSON.parse((fetcher.mock.calls[1] as [string, RequestInit])[1].body as string)).toEqual({ importToken: 'abc' });
    expect(result).toMatchObject({ created: 1, holdings: [{ assetId: 'asset-1', accountId: 'account-2', qty: '12' }] });
  });

  it('keeps cents exact, surfaces reconciliation errors and includes all affected cache families', () => {
    expect(moneyCents('900719925474099301')).toBe('R$ 9.007.199.254.740.993,01');
    expect(importError({ status: 409, message: 'Conciliação pendente' })).toBe('Conciliação pendente');
    expect(affectedImportKeys).toEqual(expect.arrayContaining(['transactions', 'holdings', 'dashboard-summary', 'dividends', 'reports-income', 'nota-history']));
  });
  it('translates actual CSV parser, route and journal failures while retaining field names', () => {
    expect(csvRowMessage('Required columns: type, date, account, symbol, qty, unitpricecents, feecents'))
      .toContain('Colunas obrigatórias: type, date, account, symbol, qty, unitpricecents, feecents');
    expect(csvRowMessage('Invalid type, date, account, symbol, positive qty/price, fee or FX rate'))
      .toContain('unitPriceCents positivos, feeCents não negativo e fxRateToBRL positivo');
    expect(csvRowMessage('USD requires original historical FX; BRL must not include FX')).toContain('USD exigem fxRateToBRL histórico original');
    expect(csvRowMessage('USD transactions require a positive historical fxRateToBRL')).toContain('USD, informe fxRateToBRL');
    expect(csvRowMessage('BRL transactions must not include FX')).toContain('BRL, deixe fxRateToBRL vazio');
    expect(csvRowMessage('Account not found')).toBe('Conta não encontrada');
    expect(csvRowMessage('Asset not found')).toBe('Ativo não encontrado');
    expect(csvRowMessage('No rows found')).toBe('Nenhuma linha encontrada');
    expect(csvRowMessage('Maximum 200 rows')).toBe('Máximo de 200 linhas');
    expect(csvRowMessage('Malformed CSV quoting')).toBe('Aspas inválidas no CSV');
    expect(csvRowMessage('Unterminated CSV quoted field')).toBe('Campo entre aspas não fechado');
    expect(csvRowMessage('Column count mismatch')).toContain('quantidade de colunas');
    expect(csvRowMessage('Expected 1–200 rows')).toContain('entre 1 e 200');
    expect(csvRowMessage('Historical FX repair required for transaction IDs: 123')).toContain('câmbio histórico');
    expect(csvRowMessage('Unrecognized provider exception')).toBe('Não foi possível validar esta linha. Confira o arquivo e tente novamente.');
  });
});
