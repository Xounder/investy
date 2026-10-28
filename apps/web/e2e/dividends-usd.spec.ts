import { expect, test } from '@playwright/test';

test('USD provento confirms date, requires historical FX for payment and shows BRL income with USD original', async ({ page }) => {
  const year = new Date().getFullYear();
  const exDate = `${year}-10-02`;
  const paymentDate = `${year}-10-15`;
  const patches: Record<string, string>[] = [];
  const item = {
    id: '44444444-4444-4444-8444-444444444444', portfolioId: '11111111-1111-4111-8111-111111111111',
    assetId: '33333333-3333-4333-8333-333333333333', symbol: 'USDF', assetName: 'Fundo dólar', assetClass: 'etf_us',
    kind: 'dividend', category: 'income', exDate, paymentDate: null as string | null,
    currency: 'USD', rateCentsPerUnit: '125', eligibleQty: '10', nativeAmountCents: '1250',
    amountCurrency: 'USD', amountCents: '1250', amountCentsBRL: null as string | null,
    status: 'expected', source: 'provider', reconciliationRequired: false,
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === '/api/v1/dividends/agenda') body = { items: [item], projections: [] };
    if (path === '/api/v1/dividends/history') body = { year, month: null, totalCents: '6563', totalsIncomplete: false, months: [{ year, month: 10, totalCents: '6563', totalsIncomplete: false, items: [item] }] };
    if (path === `/api/v1/dividends/${item.id}` && route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON() as Record<string, string>;
      patches.push(patch);
      item.status = patch.status ?? item.status;
      if (patch.paymentDate) item.paymentDate = patch.paymentDate;
      if (patch.status === 'paid') { item.amountCents = '6563'; item.amountCurrency = 'BRL'; item.amountCentsBRL = '6563'; }
      body = item;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/dividends');
  await expect(page.getByText('Data-com: 02/10/' + year)).toBeVisible();
  await expect(page.getByText(/US\$ 12,50 \(valor na moeda original\)/)).toBeVisible();
  await expect(page.getByText(/Valor em BRL indisponível/)).toBeVisible();
  await page.getByLabel('Data de pagamento de USDF').fill(paymentDate);
  await page.getByRole('button', { name: 'Confirmar data' }).click();
  const pay = page.getByRole('button', { name: 'Marcar como pago' });
  await expect(pay).toBeDisabled();
  const fx = page.getByRole('textbox', { name: /Câmbio histórico na data do recebimento/ });
  await fx.fill('5,250001');
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect(page.getByText('Valor contabilizado em BRL: R$ 65,63')).toBeVisible();
  expect(patches).toEqual([{ status: 'confirmed', paymentDate }, { status: 'paid', fxRateToBRL: '5250001' }]);
  await page.getByRole('tab', { name: 'Histórico de renda' }).click();
  await expect(page.getByText('Renda recebida')).toBeVisible();
  await expect(page.getByText('Original: US$ 12,50')).toBeVisible();
  await expect(page.getByRole('cell', { name: /R\$ 65,63 Original: US\$ 12,50/ })).toBeVisible();
});

test('legacy paid income has no trusted receipt and reports partial zero, not confirmed income', async ({ page }) => {
  const year = new Date().getFullYear();
  const item = {
    id: '44444444-4444-4444-8444-444444444444', portfolioId: '11111111-1111-4111-8111-111111111111',
    assetId: '33333333-3333-4333-8333-333333333333', symbol: 'LEG11', assetName: 'Legado', assetClass: 'fii',
    kind: 'rendimento', category: 'income', exDate: `${year}-10-02`, paymentDate: `${year}-10-15`,
    currency: 'BRL', rateCentsPerUnit: '125', eligibleQty: '10', nativeAmountCents: '1250',
    amountCurrency: 'BRL', amountCents: '1250', amountCentsBRL: null,
    status: 'paid', source: 'manual', reconciliationRequired: true,
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/v1/dividends/agenda' ? { items: [item], projections: [] } :
      path === '/api/v1/dividends/history' ? { year, month: null, totalCents: '0', totalsIncomplete: true,
        months: [{ year, month: 10, totalCents: '0', totalsIncomplete: true, items: [item] }] } : {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/dividends');
  await expect(page.getByText(/Pagamento legado sem vínculo confiável/)).toBeVisible();
  await expect(page.getByText(/estimativa por posição, não é valor recebido/)).toBeVisible();
  await page.getByRole('tab', { name: 'Histórico de renda' }).click();
  await expect(page.getByText('Total parcial: R$ 0,00', { exact: true })).toBeVisible();
  await expect(page.getByText(/Total do mês incompleto/)).toBeVisible();
  await expect(page.getByText(/Recebimento legado não conciliado; valor não confirmado/)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'LEG11' }).locator('td').last()).not.toContainText('R$ 12,50');
});
