import { expect, test as base, request, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { seedFreshQuote } from './seed';

export const password = 'InvestyE2e!2026';
export interface Owner { api: APIRequestContext; email: string; portfolioId: string; accountId: string; cleanupQuote?: () => Promise<void> }

export async function createOwner(page: Page, configure = true): Promise<Owner> {
  const email = `e2e-${randomUUID()}@example.test`;
  const api = await request.newContext({ baseURL: 'http://localhost:5173' });
  let cleanupQuote: (() => Promise<void>) | undefined;
  try {
    const registered = await api.post('/api/v1/auth/register', { data: { email, password, name: 'E2E Owner' } });
    expect(registered.status(), 'Registration must persist a usable session').toBe(201);
    expect((await api.get('/api/v1/auth/me')).status()).toBe(200);
    let portfolioId = ''; let accountId = '';
    if (configure) {
      const brokerResponse = await api.get('/api/v1/brokers');
      expect(brokerResponse.ok()).toBeTruthy();
      const brokers = (await brokerResponse.json() as { brokers: { id: string }[] }).brokers;
      expect(brokers.length, 'Boot catalog must include a broker').toBeGreaterThan(0);
      const onboard = await api.post('/api/v1/onboarding', { data: {
        portfolioName: 'Carteira E2E', brokerId: brokers[0]!.id,
        accountName: 'Conta E2E',
      } });
      expect(onboard.status(), 'Onboarding must persist a portfolio and an account').toBe(201);
      ({ portfolioId, accountId } = await onboard.json() as { portfolioId: string; accountId: string });
      expect(portfolioId).toBeTruthy(); expect(accountId).toBeTruthy();
    }
    cleanupQuote = await seedFreshQuote();
    await page.context().addCookies((await api.storageState()).cookies);
    return { api, email, portfolioId, accountId, cleanupQuote };
  } catch (error) {
    try { await cleanupQuote?.(); await api.delete('/api/v1/settings/account', { data: { email, password } }); }
    finally { await api.dispose(); }
    throw error;
  }
}

export async function eraseOwner(owner: Owner): Promise<void> {
  try {
    const response = await owner.api.delete('/api/v1/settings/account', { data: { email: owner.email, password } });
    expect(response.status(), 'Owner-scoped test data must be deleted').toBe(204);
  } finally { try { await owner.cleanupQuote?.(); } finally { await owner.api.dispose(); } }
}

export const test = base.extend<{ owner: Owner }>({
  owner: async ({ page }, use) => {
    base.skip(!process.env.E2E_DATABASE_URL, 'Real PostgreSQL journeys require dedicated E2E_DATABASE_URL (no production fallback).');
    const owner = await createOwner(page);
    try { await use(owner); } finally { await eraseOwner(owner); }
  },
});

export async function buy(page: Page, accountId: string, symbol = 'PETR4', qty = '3') {
  await page.goto('/global-action');
  const drawer = page.getByRole('dialog', { name: 'Registrar operação' });
  await drawer.getByLabel('Conta').selectOption(accountId);
  await drawer.getByLabel('Ativo').fill(symbol);
  await drawer.getByRole('option', { name: new RegExp(symbol) }).click();
  await drawer.getByLabel('Quantidade').fill(qty);
  await drawer.getByLabel(/Preço unitário/).fill('25,00');
  await drawer.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(drawer).toHaveCount(0);
}
