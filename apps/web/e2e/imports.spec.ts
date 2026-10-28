import { expect, test } from '@playwright/test';

const portfolio = '11111111-1111-4111-8111-111111111111';
const account = '33333333-3333-4333-8333-333333333333';
const broker = '22222222-2222-4222-8222-222222222222';
const token = '55555555-5555-4555-8555-555555555555';
const preview = { nota: { brokerId: broker, notaNumber: '77', tradeDate: '2026-01-15',
  items: [{ direction: 'C', symbol: 'PETR4', qty: '2', unitPriceCents: '2500', dayTrade: false }],
  fees: { liquidacao: '1', corretagem: '2', emolumentos: '0', iss: '0', irrf: '0' },
  rateio: ['3'], warnings: [], importToken: token } };

test('nota file upload, review, confirmation and journal growth; duplicate and token expiry recover', async ({ page }) => {
  let writes = 0; let count = 0; let previews = 0; let failure: 'duplicate' | 'expired' | null = null;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path === '/api/v1/portfolios') body = { portfolios: [{ id: portfolio, name: 'Principal', isDefault: true }] };
    if (path === '/api/v1/accounts') body = { accounts: [{ id: account, name: 'Minha conta', portfolioId: portfolio, brokerId: broker }] };
    if (path === '/api/v1/brokers') body = { brokers: [{ id: broker, name: 'Minha corretora' }] };
    if (path.endsWith('/nota/history')) body = { items: count ? [{ id: token, brokerId: broker, notaNumber: '77', tradeDate: '2026-01-15T00:00:00Z', status: 'confirmed', createdAt: '2026-01-15T00:00:00Z' }] : [] };
    if (path.endsWith('/nota/preview')) {
      previews++;
      const post = route.request().postDataBuffer()?.toString() ?? '';
      expect(post).toContain('filename="nota.txt"');
      expect(post).toContain('name="accountId"');
      expect(post).toContain(account);
      body = failure === 'duplicate' ? { nota: { ...preview.nota, warnings: [{ type: 'DUPLICATE', message: 'Nota já importada', details: token }] } } : preview;
    }
    if (path.endsWith('/nota/confirm')) {
      writes++;
      expect(route.request().postDataJSON()).toEqual({ importToken: token });
      if (failure === 'expired') { status = 400; body = { error: { code: 'VALIDATION', message: 'Token expirado' } }; }
      else { status = 201; count++; body = { created: 1, holdings: [{ id: 'holding-1', assetId: 'asset', accountId: account, qty: '9007199254740993', avgPriceCents: '2500', costBasisCents: '225179981368524825' }] }; }
    }
    if (path === '/api/v1/transactions') body = { items: Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, date: '2026-01-15T00:00:00Z', type: 'buy', assetId: 'asset', accountId: account, qty: '2', unitPriceCents: '2500', feeCents: '3', notes: null })), page: 1, hasMore: false };
    if (path === '/api/v1/assets') body = { items: [{ id: 'asset', symbol: 'PETR4', name: 'Petrobras', class: 'acao', currency: 'BRL' }], totalPages: 1 };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/transactions');
  await expect(page.getByText('Nenhuma transação encontrada.')).toBeVisible();
  await page.getByRole('link', { name: 'Importar transações ou nota' }).click();
  await page.getByRole('link', { name: 'Importar nota de corretagem' }).click();
  await page.getByLabel('Corretora').selectOption(broker);
  await page.getByLabel('Conta').selectOption(account);
  await page.getByLabel('Arquivo da nota').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('Corretora: Minha corretora\nNúmero Nota: 77\nData Pregão: 15/01/2026\nC PETR4 2 25,00') });
  await page.getByRole('button', { name: 'Visualizar nota' }).click();
  await expect(page.getByRole('region', { name: 'Revisão da nota' }).getByText('R$ 0,03')).toHaveCount(3);
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByText('1 registros importados.', { exact: false })).toBeVisible();
  await expect(page.getByText('Posições após a importação (1 recalculadas)')).toBeVisible();
  await expect(page.getByRole('status').getByText('PETR4 · Conta Minha conta · Saldo 9.007.199.254.740.993 unidades')).toBeVisible();
  await expect(page.getByText('Referência ' + token)).toBeVisible();
  await page.getByRole('link', { name: 'Ver transações' }).click();
  await expect(page.getByRole('row', { name: /PETR4/ })).toBeVisible();
  await page.goto('/transactions/import/nota');
  failure = 'duplicate';
  await page.getByLabel('Corretora').selectOption(broker);
  await page.getByLabel('Conta').selectOption(account);
  await page.getByRole('radio', { name: 'Colar texto' }).check();
  await page.getByLabel('Texto da nota').fill('Corretora: Minha corretora\nNúmero Nota: 77\nData Pregão: 15/01/2026\nC PETR4 2 25,00');
  await page.getByRole('button', { name: 'Visualizar nota' }).click();
  await expect(page.getByText('Nota já importada', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar importação' })).toBeDisabled();
  failure = 'expired';
  await page.getByLabel('Texto da nota').fill('Corretora: Minha corretora\nNúmero Nota: 78\nData Pregão: 15/01/2026\nC PETR4 2 25,00');
  await page.getByRole('button', { name: 'Visualizar nota' }).click();
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('alert').getByText(/Token expirado/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar importação' })).toHaveCount(0);
  expect({ writes, previews, count }).toEqual({ writes: 2, previews: 3, count: 1 });
});

test('CSV multipart row errors, editable retry, model and successful import', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;
    if (path === '/api/v1/portfolios') body = { portfolios: [{ id: portfolio, name: 'Principal', isDefault: true }] };
    if (path === '/api/v1/accounts') body = { accounts: [{ id: account, name: 'Conta, Teste', portfolioId: portfolio }] };
    if (path.endsWith('/import/csv')) {
      calls++;
      const payload = route.request().postDataBuffer()?.toString() ?? '';
      expect(payload).toContain('name="file"');
      expect(payload).toContain('filename="entrada.csv"');
      if (calls === 1) { status = 400; body = { created: 0, errors: [{ line: 2, message: 'Asset not found' }] }; }
      else { status = 201; body = { created: 1, errors: [] }; }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/transactions/import');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Baixar modelo CSV/ }).click();
  expect((await download).suggestedFilename()).toBe('investy-modelo-transacoes.csv');
  await page.getByLabel('Arquivo CSV').setInputFiles({ name: 'entrada.csv', mimeType: 'text/csv', buffer: Buffer.from('type,date,account,symbol,qty,unitPriceCents,feeCents\nbuy,2026-01-15,"Conta, Teste",PETR4,1,2500,0') });
  await page.getByRole('button', { name: 'Importar CSV' }).click();
  await expect(page.getByRole('list', { name: 'Erros por linha' }).getByText(/Linha 2: Ativo não encontrado/)).toBeVisible();
  await page.getByText('Detalhes técnicos').click();
  await expect(page.getByText('Asset not found')).toBeVisible();
  await page.getByRole('button', { name: 'Importar CSV' }).click();
  await expect(page.getByText('1 transações importadas.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importar CSV' })).toBeDisabled();
  expect(calls).toBe(2);
});

test('CSV file cannot change while an upload is awaiting the server', async ({ page }) => {
  let completeUpload: (() => void) | undefined;
  let calls = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/import/csv')) {
      calls++;
      await new Promise<void>((resolve) => { completeUpload = resolve; });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ created: 1, errors: [] }) });
    } else await route.fulfill({ contentType: 'application/json', body: JSON.stringify(path.endsWith('/portfolios')
      ? { portfolios: [{ id: portfolio, name: 'Principal', isDefault: true }] }
      : path.endsWith('/accounts') ? { accounts: [{ id: account, name: 'Conta A', portfolioId: portfolio }] } : {}) });
  });
  await page.goto('/transactions/import');
  const input = page.getByLabel('Arquivo CSV');
  await input.setInputFiles({ name: 'A.csv', mimeType: 'text/csv', buffer: Buffer.from('type,date,account,symbol,qty,unitPriceCents,feeCents\nbuy,2026-01-15,Conta A,PETR4,1,2500,0') });
  await page.getByRole('button', { name: 'Importar CSV' }).click();
  await expect(input).toBeDisabled();
  await expect(page.getByText('Selecionado: A.csv')).toBeVisible();
  await expect.poll(() => calls).toBe(1);
  completeUpload?.();
  await expect(page.getByText('1 transações importadas.', { exact: false })).toBeVisible();
  await input.setInputFiles({ name: 'B.csv', mimeType: 'text/csv', buffer: Buffer.from('type,date,account,symbol,qty,unitPriceCents,feeCents\nbuy,2026-01-15,Conta A,PETR4,1,2500,0') });
  await expect(page.getByText('Selecionado: B.csv')).toBeVisible();
  await expect(page.getByText('1 transações importadas.', { exact: false })).toHaveCount(0);
  expect(calls).toBe(1);
});
