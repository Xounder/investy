import { expect, test, type Page } from '@playwright/test';

const portfolioId = '11111111-1111-4111-8111-111111111111';
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const dates = [day(-89), day(-50), day(-29), day(-12), day(-2)];
const comparison = (empty: boolean) => ({ kind: 'observed_value_including_cash_flows', currency: 'BRL', timezone: 'America/Sao_Paulo', currentAt: new Date().toISOString(), previousAt: empty ? null : `${day(-1)}T12:00:00Z`, previousDate: empty ? null : day(-1), period: empty ? null : 'since_snapshot', reason: empty ? 'NO_SNAPSHOT' : null, hasStaleQuotes: !empty, total: empty ? null : { amountCents: '5000', percent: 4.17 }, cost: empty ? null : { amountCents: '1000', percent: null }, unrealized: empty ? null : { amountCents: '4000', percent: 19.05 }, dayMainChange: empty ? null : { amountCents: '5000', percent: 4.17 } });

async function mockDashboard(page: Page, options: { empty?: boolean; failIndicatorsOnce?: boolean; delayedPortfolio?: boolean; cdiUnavailable?: boolean } = {}) {
  let indicatorCalls = 0;
  let releasePortfolio: (() => void) | undefined;
  const portfolioGate = new Promise<void>((resolve) => { releasePortfolio = resolve; });
  const calls: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    calls.push(`${path}${url.search}`);
    if (path === '/api/v1/portfolios' && options.delayedPortfolio) await portfolioGate;
    let body: unknown = {};
    if (path === '/api/v1/portfolios') body = { portfolios: [{ id: portfolioId, name: 'Principal', isDefault: true }] };
    else if (path === '/api/v1/portfolio/summary') body = { totalMarketValueCents: options.empty ? '0' : '125000', totalCostBasisCents: options.empty ? '0' : '100000', unrealizedPnlCents: options.empty ? '0' : '25000', unpricedCostBasisCents: '0', holdingsCount: options.empty ? 0 : 2, currency: 'BRL', comparison: comparison(!!options.empty) };
    else if (path === '/api/v1/portfolio/allocation') body = options.empty ? { byClass: [], bySector: [] } : { byClass: [{ key: 'acao', valueCents: '100000', percent: 80 }, { key: 'fii', valueCents: '25000', percent: 20 }], bySector: [{ key: 'Energia', valueCents: '125000', percent: 100 }] };
    else if (path === '/api/v1/portfolio/snapshots') body = { snapshots: options.empty ? [] : dates.map((date, i) => ({ date, totalValueCents: String(100000 + i * 5000), costBasisCents: '100000' })) };
    else if (path === '/api/v1/holdings') body = { holdings: options.empty ? [] : [{ isStale: true }] };
    else if (path === '/api/v1/market/benchmarks/cdi-index') {
      const months = url.searchParams.get('range') === '1m' ? 1 : 3;
      const today = new Date();
      const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, 1));
      const lastDay = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + 1, 0)).getUTCDate();
      startMonth.setUTCDate(Math.min(today.getUTCDate(), lastDay));
      const start = startMonth.toISOString().slice(0, 10);
      const series = dates.filter((date) => date >= start).map((date, i) => ({ date, value: 100 + i * 0.5 }));
      body = { cdiIndex: { symbol: 'CDI', source: 'BCB_SGS_12', rateUnit: 'percent_per_business_day', indexUnit: 'base_100', range: url.searchParams.get('range'), requestedStartDate: start, requestedEndDate: day(0), baseDate: options.cdiUnavailable ? null : series[0]?.date, lastObservationDate: options.cdiUnavailable ? null : series.at(-1)?.date, coverage: options.cdiUnavailable ? 'UNAVAILABLE' : 'COMPLETE_THROUGH_LAST_OBSERVATION', reason: options.cdiUnavailable ? 'PROVIDER_UNAVAILABLE_OR_INCOMPLETE' : null, fetchedAt: options.cdiUnavailable ? null : new Date().toISOString(), indexSeries: options.cdiUnavailable ? [] : series } };
    }
    else if (path === '/api/v1/market/indicators') {
      indicatorCalls++;
      if (options.failIndicatorsOnce && indicatorCalls === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Sem conexão' } }) });
        return;
      }
      body = { indicators: [{ symbol: 'IBOV', value: 130000, date: '2020-01-02' }, { symbol: 'CDI', value: 13, date: '2020-01-02' }] };
    } else if (path === '/api/v1/market/benchmarks') body = { benchmarks: [
      { symbol: 'IBOV', series: dates.map((date, i) => ({ date, value: 100 + i * 5 })) },
      { symbol: 'CDI', series: dates.map((date, i) => ({ date, value: 12 + i })) },
      { symbol: 'IFIX', series: dates.map((date, i) => ({ date, value: 100 + i * 2 })) },
      { symbol: 'SPX', series: dates.map((date, i) => ({ date, value: 100 + i * 3 })) },
    ] };
    else if (path === '/api/v1/dividends/agenda') body = { items: [], projections: [] };
    else if (path === '/api/v1/transactions') body = { items: [], page: 1, hasMore: false };
    else if (path === '/api/v1/accounts') body = { accounts: [] };
    else if (path === '/api/v1/assets') body = { items: [], totalPages: 1 };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { calls, releasePortfolio: () => releasePortfolio?.() };
}

test('dashboard renders real responsive charts, exact allocation and period toggles at desktop and mobile widths', async ({ page }) => {
  const { calls } = await mockDashboard(page);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Indicadores da carteira' }).getByText('R$ 1.250,00')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Alocação' }).getByText('Ações 80,00%')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Evolução do patrimônio' }).getByText(/CDI acumulado até/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Evolução do patrimônio' }).getByText(/taxa desse primeiro dia não integra/)).toBeVisible();
  const kpis = page.getByRole('region', { name: 'Indicadores da carteira' });
  for (const label of ['Patrimônio total', 'Custo investido', 'Resultado não realizado', 'Variação desde registro']) {
    await expect(kpis.locator('[data-kpi]').filter({ hasText: label }).locator('.bg-success-light')).toBeVisible();
  }
  await expect(kpis.getByText(/base zero/)).toBeVisible();
  await expect(kpis.getByText(/inclui aportes e retiradas/)).toBeVisible();
  const charts = page.locator('.recharts-responsive-container');
  await expect(charts).toHaveCount(2);
  const kpiGrid = page.getByRole('region', { name: 'Indicadores da carteira' }).locator('.grid');
  for (const [width, columns] of [[1440, 4], [800, 2], [390, 1]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => kpiGrid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(columns);
    for (const chart of await charts.all()) {
      await expect.poll(async () => chart.locator('svg.recharts-surface').boundingBox().then((box) => box?.width ?? 0)).toBeGreaterThan(0);
      const chartWidth = await chart.boundingBox();
      expect(chartWidth?.width).toBeLessThanOrEqual(width);
    }
  }
  await page.getByRole('tab', { name: 'Setor' }).click();
  await expect(page.getByText('Energia 100,00%')).toBeVisible();
  await page.getByRole('tab', { name: 'Trimestral' }).click();
  await expect(page.getByRole('tab', { name: 'Trimestral' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => calls.some((call) => call.includes('/benchmarks/cdi-index?range=3m'))).toBe(true);
  await page.getByRole('tab', { name: 'Mensal' }).click();
  await expect(page.getByRole('tab', { name: 'Mensal' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('IBOV: desatualizado').getByText('Desatualizado')).toHaveClass(/bg-amber-100/);
  expect(calls.some((call) => call.includes(`portfolioId=${portfolioId}`))).toBe(true);
});

test('dashboard shows four skeleton cards before portfolios resolve, independent retry, empty CTAs and working routes', async ({ page }) => {
  const { releasePortfolio } = await mockDashboard(page, { delayedPortfolio: true, empty: true, failIndicatorsOnce: true });
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'Indicadores da carteira' });
  await expect(summary.locator('[aria-busy="true"]')).toHaveCount(4);
  releasePortfolio();
  await expect(page.getByText('Criar carteira')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Alocação' }).getByText(/Sem posições para distribuir/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Evolução do patrimônio' }).getByText(/Sem histórico/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Indicadores da carteira' }).locator('span[role="status"]', { hasText: 'Sem registro histórico anterior' })).toHaveCount(4);
  await expect(page.getByRole('region', { name: 'Indicadores de mercado' }).getByRole('alert')).toBeVisible();
  await page.getByRole('region', { name: 'Indicadores de mercado' }).getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByLabel('IBOV: desatualizado')).toBeVisible();
  await page.getByRole('region', { name: 'Alocação' }).getByRole('link', { name: 'Ver carteira' }).click();
  await expect(page).toHaveURL(/\/holdings$/);
  await page.goto('/');
  await page.getByRole('button', { name: '+ Registrar' }).last().click();
  await expect(page).toHaveURL(/global-action/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'Importar nota' }).click();
  await expect(page).toHaveURL(/transactions\/import\/nota/);
});

test('unavailable accumulated CDI never plots raw CDI rates as performance', async ({ page }) => {
  const { calls } = await mockDashboard(page, { cdiUnavailable: true });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Indicadores de mercado' }).getByText('13%')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Evolução do patrimônio' }).getByText(/CDI indisponível para comparação: provedor indisponível ou cobertura incompleta/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Evolução do patrimônio' }).locator('svg.recharts-surface')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Evolução do patrimônio' }).locator('path.recharts-line-curve[stroke="#6B7280"]')).toHaveCount(0);
  expect(calls.some((call) => call.includes('benchmarks/cdi-index?range=1m'))).toBe(true);
});
