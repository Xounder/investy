import { expect, test } from '@playwright/test';

const portfolio = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const account = '33333333-3333-4333-8333-333333333333';
const secondAccount = '55555555-5555-4555-8555-555555555555';
const assetId = '44444444-4444-4444-8444-444444444444';
const asset = { id: assetId, symbol: 'PETR4', name: 'Petrobras', class: 'acao', currency: 'BRL' };
const holding = { id: 'holding-1', accountId: account, assetId, symbol: 'PETR4', assetName: 'Petrobras', assetClass: 'acao', assetCurrency: 'BRL', qty: '10', avgPriceCents: '1000', costBasisCents: '10000', priceCents: '1200', marketValueCentsBRL: '12000', unrealizedPnlCentsBRL: '2000', dayChangePercent: 2.5, isStale: true };

test('portfolio switching, position action, journal write and asset deep link', async ({ page }) => {
  const calls: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    calls.push(`${route.request().method()} ${path}${url.search}`);
    let body: unknown = {};
    if (path === '/api/v1/portfolios') body = { portfolios: [{ id: portfolio, name: 'Principal', isDefault: true }, { id: other, name: 'Reserva', isDefault: false }] };
    else if (path === '/api/v1/accounts') body = { accounts: [{ id: account, name: 'Corretora', portfolioId: portfolio }] };
    else if (path === '/api/v1/holdings') body = { holdings: url.searchParams.get('portfolioId') === other ? [] : [holding] };
    else if (path === `/api/v1/holdings/${assetId}`) body = { summary: { qty: '10', priceCentsBRL: '1200', dayChangePercent: 2.5 }, quote: { isStale: false }, lots: [{ accountId: account, date: '2026-03-01T12:00:00.000Z', qty: '10', costBasisCents: '10000' }], events: [] };
    else if (path === '/api/v1/assets') body = { items: [asset], totalPages: 1 };
    else if (path === '/api/v1/assets/PETR4') body = { asset, lastQuote: { priceCents: '1200', currency: 'BRL', isStale: true } };
    else if (path === '/api/v1/transactions' && route.request().method() === 'POST') {
      const submitted = route.request().postDataJSON();
      expect(submitted).toMatchObject({ type: 'sell', assetId, accountId: account, qty: '10', unitPriceCents: '1200', feeCents: '0' });
      body = { id: 'new' };
    } else if (path === '/api/v1/transactions') body = { items: [], page: 1, hasMore: false };
    await route.fulfill({ status: path === '/api/v1/transactions' && route.request().method() === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/holdings');
  await expect(page.getByRole('button', { name: 'Vender' })).toBeVisible();
  await expect(page.getByText('+R$ 20,00')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Variação diária da cotação em BRL, sem câmbio: +2,50%' })).toHaveText('+2,50%');
  await page.getByRole('button', { name: 'Vender' }).click();
  await expect(page).toHaveURL(/global-action/);
  await expect(page.getByRole('dialog').getByText('Cotação desatualizada; confirme o preço antes de registrar.')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Quantidade')).toHaveValue('10');
  await expect(page.getByRole('dialog').getByLabel(/Preço unitário/)).toHaveValue('12,00');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page).toHaveURL(/holdings/);
  await expect(page.getByRole('status').getByText('Operação registrada com sucesso.')).toBeVisible();
  expect(calls.filter((call) => call.startsWith('GET /api/v1/holdings')).length).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'PETR4' }).click();
  await expect(page).toHaveURL(/assets\/PETR4/);
  await expect(page.getByRole('dialog').getByText('Lotes')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page).toHaveURL(/holdings/);
  await page.getByRole('combobox', { name: 'Carteira' }).selectOption(other);
  await expect(page.getByText('Nenhuma posição ainda.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Carteira' })).toHaveValue(other);
  expect(calls.some((call) => call.includes(`portfolioId=${other}`))).toBe(true);
  await page.goto('/assets/PETR4');
  await expect(page.getByRole('dialog').getByText('Lotes')).toBeVisible();
});

test('direct journal link loads and drawer validates inputs before writing', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') writes++;
    const body = path === '/api/v1/portfolios' ? { portfolios: [{ id: portfolio, name: 'Principal', isDefault: true }] } : path === '/api/v1/accounts' ? { accounts: [{ id: account, name: 'Corretora', portfolioId: portfolio }] } : path === '/api/v1/assets' ? { items: [asset], totalPages: 1 } : path === '/api/v1/transactions' ? { items: [], page: 1, hasMore: false } : {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/transactions');
  await expect(page.getByText('Nenhuma transação encontrada.')).toBeVisible();
  await page.goto('/global-action');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Quantidade').fill('0');
  await page.getByLabel(/Preço unitário/).fill('1,00');
  await page.getByRole('dialog').getByRole('textbox', { name: 'Ativo' }).fill('PETR4');
  await page.getByRole('option', { name: /PETR4/ }).click();
  await page.getByRole('dialog').getByLabel('Conta').selectOption(account);
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByRole('alert').getByText(/quantidade deve ser positiva/)).toBeVisible();
  expect(writes).toBe(0);
});

test('journal all-portfolios account filter, date/type/asset filters and pagination reach the API', async ({ page }) => {
  const requests: URL[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = {};
    if (url.pathname === '/api/v1/portfolios') body = { portfolios: [{ id: portfolio, name: 'Principal', isDefault: true }, { id: other, name: 'Reserva', isDefault: false }] };
    if (url.pathname === '/api/v1/accounts') body = { accounts: url.searchParams.get('portfolioId') === other ? [{ id: secondAccount, name: 'Conta reserva', portfolioId: other }] : [{ id: account, name: 'Corretora', portfolioId: portfolio }] };
    if (url.pathname === '/api/v1/assets') body = { items: [asset], totalPages: 1 };
    if (url.pathname === '/api/v1/transactions') {
      requests.push(url);
      body = { page: Number(url.searchParams.get('page')), hasMore: url.searchParams.get('page') === '1', items: [{ id: `event-${url.searchParams.get('page')}`, date: '2026-03-01T12:00:00.000Z', type: 'jcp', assetId, accountId: secondAccount, qty: '10', unitPriceCents: '100', feeCents: '0', notes: null }] };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/transactions');
  await expect(page.getByRole('row', { name: /JCP PETR4/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Conta' }).selectOption(secondAccount);
  await expect.poll(() => requests.at(-1)?.searchParams.get('accountId')).toBe(secondAccount);
  expect(requests.at(-1)?.searchParams.has('portfolioId')).toBe(false);
  await page.getByRole('combobox', { name: 'Tipo' }).selectOption('jcp');
  await page.getByRole('textbox', { name: 'Ativo' }).fill('PETR4');
  await page.getByRole('combobox', { name: 'Filtrar ativo' }).selectOption(assetId);
  await page.getByLabel('De', { exact: true }).fill('2026-03-01');
  await page.getByLabel('Até', { exact: true }).fill('2026-03-31');
  await expect.poll(() => requests.at(-1)?.searchParams.get('to')).toBe('2026-03-31T23:59:59.999Z');
  expect(Object.fromEntries(requests.at(-1)!.searchParams)).toMatchObject({ accountId: secondAccount, assetId, type: 'jcp', from: '2026-03-01T00:00:00.000Z', page: '1' });
  await page.getByRole('button', { name: 'Próxima' }).click();
  await expect(page.getByText('Página 2')).toBeVisible();
  await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('2');
});

test('dividend and JCP are distinct; backend validation displays nested error without closing drawer', async ({ page }) => {
  const submitted: Array<Record<string, string>> = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body: unknown = {};
    if (path === '/api/v1/portfolios') body = { portfolios: [{ id: portfolio, name: 'Principal', isDefault: true }] };
    if (path === '/api/v1/accounts') body = { accounts: [{ id: account, name: 'Corretora', portfolioId: portfolio }] };
    if (path === '/api/v1/assets') body = { items: [asset], totalPages: 1 };
    if (path === '/api/v1/transactions' && method === 'POST') {
      submitted.push(route.request().postDataJSON() as Record<string, string>);
      body = submitted.length === 1 ? { id: 'dividend-1', type: 'dividend' } : { error: { code: 'INVALID_EVENT', message: 'Evento recusado pela API', fields: ['qty: inconsistent'] } };
    }
    if (path === '/api/v1/holdings') body = { holdings: [] };
    await route.fulfill({ status: method === 'POST' ? submitted.length === 1 ? 201 : 400 : 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/global-action');
  await page.getByRole('dialog').getByRole('textbox', { name: 'Ativo' }).fill('PETR4');
  await page.getByRole('option', { name: /PETR4/ }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Conta' }).selectOption(account);
  await page.getByRole('dialog').getByRole('textbox', { name: 'Quantidade' }).fill('10');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Tipo' }).selectOption('dividend');
  await page.getByRole('dialog').getByRole('textbox', { name: /Dividendo por unidade/ }).fill('1,00');
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Taxas' })).toBeDisabled();
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByText('Operação registrada com sucesso.')).toBeVisible();
  expect(submitted[0]).toMatchObject({ type: 'dividend', qty: '10', unitPriceCents: '100', feeCents: '0', assetId, accountId: account });
  await page.goto('/global-action');
  await page.getByRole('dialog').getByRole('textbox', { name: 'Ativo' }).fill('PETR4');
  await page.getByRole('option', { name: /PETR4/ }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Conta' }).selectOption(account);
  await page.getByRole('dialog').getByRole('textbox', { name: 'Quantidade' }).fill('10');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Tipo' }).selectOption('jcp');
  await page.getByRole('dialog').getByRole('textbox', { name: /JCP por unidade/ }).fill('1,00');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByRole('alert').getByText('Evento recusado pela API')).toBeVisible();
  expect(submitted.map((item) => item.type)).toEqual(['dividend', 'jcp']);
  await expect(page.getByRole('dialog')).toBeVisible();
});
