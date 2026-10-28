import { expect, request, test as base } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { buy, eraseOwner, password, test } from './owner';

base('onboarding: signup, persisted portfolio/account, first buy and dashboard', async ({ page }) => {
  base.skip(!process.env.E2E_DATABASE_URL, 'Dedicated E2E_DATABASE_URL required for real PostgreSQL.');
  const email = `e2e-${randomUUID()}@example.test`;
  let api: Awaited<ReturnType<typeof request.newContext>> | undefined;
  let registered = false;
  try {
    await page.goto('/signup');
    await page.getByLabel('Nome', { exact: true }).fill('E2E Signup');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByLabel('Confirmar senha').fill(password);
    const [registeredResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Criar conta' }).click(),
    ]);
    // Capture this user's persisted identity and session BEFORE navigation.
    // Teardown uses only this registration cookie, even if the heading fails.
    if (registeredResponse.status() === 201) {
      registered = true;
      const sessionCookie = (await registeredResponse.headerValue('set-cookie'))?.split(';')[0];
      if (!sessionCookie) throw new Error('Registration created a user without a session cookie');
      api = await request.newContext({ baseURL: 'http://localhost:5173', extraHTTPHeaders: { Cookie: sessionCookie } });
      expect((await (await api.get('/api/v1/auth/me')).json() as { email: string }).email).toBe(email);
    }
    expect(registeredResponse.status()).toBe(201);
    await expect(page.getByRole('heading', { name: 'Configure sua carteira' })).toBeVisible();
    const response = await page.request.get('/api/v1/brokers');
    expect(response.ok()).toBeTruthy();
    const brokers = (await response.json() as { brokers: { id: string }[] }).brokers;
    expect(brokers.length).toBeGreaterThan(0);
    await page.getByLabel('Nome da carteira').fill('Primeira carteira');
    await page.getByLabel('Corretora').selectOption(brokers[0]!.id);
    await page.getByRole('button', { name: 'Salvar carteira e conta' }).click();
    await expect(page.getByText('Carteira e conta prontas')).toBeVisible();
    if (!api) throw new Error('Registered account context is missing');
    const portfolios = (await (await api.get('/api/v1/portfolios')).json() as { portfolios: { id: string; name: string }[] }).portfolios;
    expect(portfolios).toHaveLength(1);
    expect(portfolios[0]!.name).toBe('Primeira carteira');
    await page.getByRole('button', { name: 'Registrar primeira compra' }).click();
    const drawer = page.getByRole('dialog', { name: 'Registrar operação' });
    const accounts = (await (await api.get(`/api/v1/accounts?portfolioId=${portfolios[0]!.id}`)).json() as { accounts: { id: string }[] }).accounts;
    expect(accounts).toHaveLength(1);
    await drawer.getByLabel('Conta').selectOption(accounts[0]!.id);
    await drawer.getByLabel('Ativo').fill('PETR4');
    await drawer.getByRole('option', { name: /PETR4/ }).click();
    await drawer.getByLabel('Quantidade').fill('2');
    await drawer.getByLabel(/Preço unitário/).fill('25,00');
    await drawer.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Seu painel de investimentos' })).toBeVisible();
    expect((await (await api.get(`/api/v1/transactions?portfolioId=${portfolios[0]!.id}`)).json() as { items: unknown[] }).items).toHaveLength(1);
  } finally {
    if (registered) {
      if (api) await eraseOwner({ api, email, accountId: '', portfolioId: '' });
    }
  }
});

test('daily check: dashboard, holding detail and persisted manual quote', async ({ page, owner }) => {
  await buy(page, owner.accountId);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Seu painel de investimentos' })).toBeVisible();
  await page.goto('/holdings');
  await page.getByRole('button', { name: 'PETR4' }).click();
  const detail = page.getByRole('dialog', { name: /Detalhes de PETR4/ });
  await expect(detail.getByText('Lotes')).toBeVisible();
  await detail.getByLabel('Preço por unidade (BRL)').fill('37,50');
  await detail.getByRole('button', { name: 'Salvar preço manual' }).click();
  await expect(detail.getByText('Preço manual ativo (BRL)', { exact: false })).toContainText('37,50');
  const response = await owner.api.get('/api/v1/assets/PETR4');
  expect((await response.json() as { userOverride: { priceCents: string } }).userOverride.priceCents).toBe('3750');
});

test('adding and selling: drawer writes and holding quantity changes', async ({ page, owner }) => {
  await buy(page, owner.accountId, 'PETR4', '3');
  await page.goto('/holdings');
  const row = page.getByRole('row', { name: /PETR4/ });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Vender' }).click();
  const drawer = page.getByRole('dialog', { name: 'Registrar operação' });
  await expect(drawer.getByLabel('Tipo')).toHaveValue('sell');
  await drawer.getByLabel('Quantidade').fill('1');
  await drawer.getByLabel(/Preço unitário/).fill('26,00');
  await drawer.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  const response = await owner.api.get(`/api/v1/transactions?portfolioId=${owner.portfolioId}`);
  expect(response.ok()).toBeTruthy();
  const items = (await response.json() as { items: { type: string }[] }).items;
  expect(items.map((item) => item.type)).toEqual(expect.arrayContaining(['buy', 'sell']));
  const holdings = (await (await owner.api.get('/api/v1/holdings')).json() as { holdings?: { qty: string }[] } | { items?: { qty: string }[] });
  expect(JSON.stringify(holdings)).toContain('"qty":"2"');
});
