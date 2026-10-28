import { expect, request, test as base } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { buy, createOwner, eraseOwner, test } from './owner';

test('two isolated sessions: no foreign data and cross-owner resources return 404', async ({ page, browser, owner }) => {
  await buy(page, owner.accountId);
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  let other: Awaited<ReturnType<typeof createOwner>> | undefined;
  try {
    other = await createOwner(otherPage);
    const foreign = await other.api.get(`/api/v1/transactions?portfolioId=${owner.portfolioId}`);
    expect(foreign.ok()).toBeTruthy();
    expect((await foreign.json() as { items: unknown[] }).items).toHaveLength(0);
    await otherPage.goto('/holdings');
    await expect(otherPage.getByText('Nenhuma posição ainda.')).toBeVisible();
    const aJournal = (await (await owner.api.get('/api/v1/transactions')).json() as { items: { id: string }[] }).items;
    expect(aJournal).toHaveLength(1);
    const edit = await other.api.patch(`/api/v1/transactions/${aJournal[0]!.id}`, { data: { notes: 'foreign' } });
    expect(edit.status()).toBe(404);
    const portfolio = await other.api.patch(`/api/v1/portfolios/${owner.portfolioId}`, { data: { name: 'foreign' } });
    expect(portfolio.status()).toBe(404);
    expect((await (await owner.api.get('/api/v1/transactions')).json() as { items: { notes: string | null }[] }).items[0]!.notes).toBeNull();
  } finally {
    try { if (other) await eraseOwner(other); }
    finally { await otherContext.close(); }
  }
});

test('CORS preflight, SQL validation and health are enforced by live HTTP API', async ({ owner }) => {
  const direct = await request.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const health = await direct.get('/api/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    const good = await direct.fetch('/api/v1/auth/me', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } });
    expect(good.headers()['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(good.headers()['access-control-allow-credentials']).toBe('true');
    const evil = await direct.fetch('/api/v1/auth/me', { method: 'OPTIONS', headers: { Origin: 'https://attacker.example', 'Access-Control-Request-Method': 'GET' } });
    expect(evil.headers()['access-control-allow-origin']).not.toBe('https://attacker.example');
    const injection = await owner.api.get('/api/v1/transactions?portfolioId=' + encodeURIComponent("' OR 1=1 --"));
    expect(injection.status()).toBe(400);
    expect((await injection.json() as { error: { code: string } }).error.code).toBe('VALIDATION');
    expect((await owner.api.get('/api/v1/portfolios')).status()).toBe(200);
  } finally { await direct.dispose(); }
});

test('auth rate limiter responds 429 after its actual per-IP allowance', async () => {
  base.skip(!process.env.E2E_DATABASE_URL, 'Dedicated E2E_DATABASE_URL required for real API.');
  const direct = await request.newContext({ baseURL: 'http://localhost:3000', extraHTTPHeaders: { 'x-forwarded-for': `e2e-${randomUUID()}` } });
  try {
    for (let i = 0; i < 10; i++) {
      const response = await direct.post('/api/v1/auth/login', { data: { email: 'no-such-user@example.test', password: 'invalid' } });
      expect(response.status()).toBe(401);
      expect(response.headers()['x-ratelimit-remaining']).toBe(String(9 - i));
    }
    const denied = await direct.post('/api/v1/auth/login', { data: { email: 'no-such-user@example.test', password: 'invalid' } });
    expect(denied.status()).toBe(429);
    expect((await denied.json() as { error: { code: string } }).error.code).toBe('RATE_LIMIT_EXCEEDED');
  } finally { await direct.dispose(); }
});

test('stored XSS is rendered as text, not executable DOM', async ({ page, owner }) => {
  const payload = `<img src=x onerror="window.__e2e_xss=1">${randomUUID()}`;
  const saved = await owner.api.patch(`/api/v1/portfolios/${owner.portfolioId}`, { data: { name: payload } });
  expect(saved.ok()).toBeTruthy();
  await page.goto('/settings');
  await expect(page.getByText(payload, { exact: false }).first()).toBeVisible();
  expect(await page.locator('img[onerror]').count()).toBe(0);
  expect(await page.evaluate(() => Object.hasOwn(window, '__e2e_xss'))).toBe(false);
});
