import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { buy, test } from './owner';
import { seedComparableSnapshots } from './seed';

test('nota day: upload real note, preview, confirm and journal growth', async ({ page, owner }) => {
  const before = (await (await owner.api.get('/api/v1/transactions')).json() as { items: unknown[] }).items.length;
  await page.goto('/transactions');
  await page.getByRole('link', { name: 'Importar transações ou nota' }).click();
  await page.getByRole('link', { name: 'Importar nota de corretagem' }).click();
  const brokers = (await (await owner.api.get('/api/v1/brokers')).json() as { brokers: { id: string }[] }).brokers;
  const account = (await (await owner.api.get(`/api/v1/accounts?portfolioId=${owner.portfolioId}`)).json() as { accounts: { id: string; brokerId: string }[] }).accounts[0]!;
  expect(brokers.some((broker) => broker.id === account.brokerId)).toBeTruthy();
  await page.getByLabel('Corretora').selectOption(account.brokerId);
  await page.getByLabel('Conta').selectOption(account.id);
  const number = randomUUID().slice(0, 12);
  await page.getByLabel('Arquivo da nota').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain',
    buffer: Buffer.from(`Corretora: E2E\nNúmero Nota: ${number}\nData Pregão: 15/01/2026\nC PETR4 2 25,00`) });
  await page.getByRole('button', { name: 'Visualizar nota' }).click();
  await expect(page.getByRole('region', { name: 'Revisão da nota' })).toContainText('PETR4');
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('status').getByText('1 registros importados.', { exact: false })).toBeVisible();
  const after = (await (await owner.api.get('/api/v1/transactions')).json() as { items: unknown[] }).items.length;
  expect(after).toBe(before + 1);
});

test('dividend month: create, confirm pay date and view paid income', async ({ page, owner }) => {
  await buy(page, owner.accountId);
  await page.goto('/dividends');
  await page.getByRole('button', { name: 'Registrar provento' }).click();
  const form = page.getByRole('form', { name: 'Registrar provento' });
  await form.getByLabel('Carteira').selectOption(owner.portfolioId);
  const catalog = (await (await owner.api.get('/api/v1/assets?search=PETR4')).json() as { items: { id: string; symbol: string }[] }).items;
  await form.getByLabel('Ativo').selectOption(catalog.find((item) => item.symbol === 'PETR4')!.id);
  const today = new Date(); const ex = new Date(today); ex.setUTCDate(ex.getUTCDate() + 1);
  const pay = new Date(ex); pay.setUTCDate(pay.getUTCDate() + 1);
  await form.getByLabel('Data-com').fill(ex.toISOString().slice(0, 10));
  await form.getByLabel(/Valor por cota/).fill('1,00');
  await form.getByRole('button', { name: 'Salvar provento' }).click();
  await expect(page.getByRole('region', { name: 'Agenda por data-com' }).getByText('PETR4')).toBeVisible();
  await page.getByLabel('Data de pagamento de PETR4').fill(pay.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Confirmar data' }).click();
  await page.getByRole('button', { name: 'Marcar como pago' }).click();
  await page.getByRole('tab', { name: 'Histórico de renda' }).click();
  await expect(page.getByText('PETR4', { exact: true })).toBeVisible();
  const history = await owner.api.get(`/api/v1/dividends/history?year=${today.getUTCFullYear()}`);
  expect(history.ok()).toBeTruthy();
  expect((await history.json() as { totalCents: string }).totalCents).toBe('300');
});

test('quarterly report: observed performance chart then export JSON', async ({ page, owner }) => {
  await buy(page, owner.accountId);
  const { points, cleanup } = await seedComparableSnapshots(owner);
  try {
    expect(points).toHaveLength(3);
    expect(points.map((point) => point.totalValueCents)).toEqual(['7500', '7600', '7700']);
    const monthlyResponse = await owner.api.get(`/api/v1/reports/performance?portfolioId=${owner.portfolioId}&granularity=month`);
    const quarterResponse = await owner.api.get(`/api/v1/reports/performance?portfolioId=${owner.portfolioId}&granularity=quarter`);
    expect(monthlyResponse.status()).toBe(200);
    expect(quarterResponse.status()).toBe(200);
    type Observation = { date: string; portfolioValueCents: string; portfolioIndex: number; benchmarks: { IBOV: number | null } };
    type Period = Observation & { period: string };
    type Report = { baseDate: string; baseObservation: Observation; disclosure: string; source: string; periods: Period[] };
    const monthly = await monthlyResponse.json() as Report;
    const quarterly = await quarterResponse.json() as Report;
    expect(monthly.source).toBe('PERSISTED_PORTFOLIO_SNAPSHOTS');
    expect(quarterly.disclosure).toContain('not a cash-flow-adjusted return');
    expect(quarterly.baseDate).toBe(points[0]!.date);
    expect(monthly.baseObservation.portfolioValueCents).toBe('7500');
    expect(quarterly.periods).toHaveLength(1);
    expect(monthly.periods).toHaveLength(2);
    expect(monthly.periods[0]).toMatchObject({ date: points[1]!.date, portfolioValueCents: '7600' });
    expect(monthly.periods[1]).toMatchObject({ date: points[2]!.date, portfolioValueCents: '7700' });
    expect(quarterly.periods[0]).toMatchObject({ date: points[2]!.date, portfolioValueCents: '7700' });
    const expectedIndex = Math.floor(7700 * 1_000_000 / 7500) / 10_000;
    expect(quarterly.periods[0]!.portfolioIndex).toBe(expectedIndex);
    expect(quarterly.periods[0]!.benchmarks.IBOV).toBeCloseTo(points[2]!.ibov * 100 / points[0]!.ibov, 5);
    await page.goto('/reports');
    const table = page.getByRole('table', { name: 'Observações de patrimônio e índices base 100' });
    await expect(table.getByRole('row', { name: new RegExp(points[1]!.date) })).toBeVisible();
    await page.getByRole('button', { name: 'Trimestral' }).click();
    await expect(page.getByText(/Patrimônio observado inclui aportes e saques; não é rentabilidade ajustada por fluxos/)).toBeVisible();
    await expect(page.getByLabel('Gráfico de patrimônio e índices base 100')).toBeVisible();
    // The frontend retains the genuine base observation and the last index
    // close of the quarter; it drops the intra-quarter middle observation.
    await expect(table.getByRole('row', { name: new RegExp(points[0]!.date) })).toBeVisible();
    const lastRow = table.getByRole('row', { name: new RegExp(points[2]!.date) });
    await expect(lastRow).toBeVisible();
    await expect(lastRow).toContainText(new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(expectedIndex));
    await expect(lastRow).toContainText(new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(points[2]!.ibov * 100 / points[0]!.ibov));
    await expect(table.getByRole('row', { name: new RegExp(points[1]!.date) })).toHaveCount(0);
    await page.getByRole('link', { name: 'Exportar dados nas Configurações' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar JSON' }).click();
    expect((await download).suggestedFilename()).toBe('investy-export.json');
    const binary = await owner.api.post('/api/v1/export?format=json');
    expect(binary.ok()).toBeTruthy();
    expect(await binary.text()).toContain(owner.portfolioId);
  } finally { await cleanup(); }
});
