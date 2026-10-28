import { expect, test } from '@playwright/test';

test('reports render independently on mobile, switch periods and retry failures', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const year = new Date().getFullYear();
  let failed = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/transactions' && failed < 2) {
      failed++;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Falha temporária' } }) });
      return;
    }
    const body = path === '/api/v1/portfolios' ? { portfolios: [{ id, name: 'Principal', isDefault: true }] }
      : path === '/api/v1/portfolio/snapshots' ? { snapshots: [{ date: '2026-01-02', totalValueCents: '10000' }, { date: '2026-02-02', totalValueCents: '12000' }] }
      : path === '/api/v1/market/benchmarks' ? { benchmarks: [{ symbol: 'IBOV', series: [{ date: '2026-01-02', value: 100 }, { date: '2026-02-02', value: 110 }] }] }
      : path === '/api/v1/market/benchmarks/cdi-index' ? { cdiIndex: { coverage: 'UNAVAILABLE', indexSeries: [], indexUnit: 'base_100', rateUnit: 'percent_per_business_day' } }
      : path === '/api/v1/transactions' ? { items: [{ id: 'sale', date: '2026-02-02', realizedPnlCents: '-235' }], hasMore: false }
      : path === '/api/v1/dividends/history' ? { year, months: [{ year, month: 2, items: [{ id: 'receipt', portfolioId: id, category: 'income', status: 'paid', assetClass: 'fii', amountCentsBRL: '150', reconciliationRequired: false }, { id: 'legacy', portfolioId: id, category: 'income', status: 'paid', assetClass: 'fii', amountCentsBRL: null, reconciliationRequired: true }] }] } : {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/reports');
  const performance = page.getByRole('region', { name: 'Desempenho comparado' });
  await expect(performance.getByText(/não é rentabilidade ajustada/)).toBeVisible();
  await expect(performance.getByRole('table')).toContainText('110,00');
  await expect(performance.getByLabel('Legenda do desempenho')).toContainText('CDI: indisponível');
  await expect(performance.getByLabel('Legenda do desempenho')).toContainText('IBOV: disponível');
  await expect(performance.getByLabel('Legenda do desempenho')).toContainText('SPX: indisponível');
  const pnl = page.getByRole('region', { name: 'Resultado realizado em vendas' });
  await expect(pnl.getByRole('alert')).toBeVisible();
  await pnl.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(pnl.getByRole('table')).toContainText('−R$ 2,35');
  await expect(page.getByRole('region', { name: 'Renda mensal por classe' }).getByRole('table')).toContainText('R$ 1,50');
  await expect(page.getByText(/Totais parciais/)).toBeVisible();
  await page.getByRole('button', { name: 'Trimestral' }).click();
  await expect(page.getByRole('button', { name: 'Trimestral' })).toHaveAttribute('aria-pressed', 'true');
  await expect(pnl.getByRole('table')).toContainText('2026-T1');
  await expect.poll(async () => (await performance.locator('.recharts-responsive-container').boundingBox())?.width ?? 0).toBeGreaterThan(0);
});
