import { expect, test } from '@playwright/test';

test('signup confirms session, bootstraps owned resources once, registers via journal and switches owners on logout/login', async ({ page }) => {
  const portfolio = '11111111-1111-4111-8111-111111111111';
  const account = '33333333-3333-4333-8333-333333333333';
  const assetId = '44444444-4444-4444-8444-444444444444';
  const asset = { id: assetId, symbol: 'PETR4', name: 'Petrobras', class: 'acao', currency: 'BRL' };
  let owner: 'new' | 'returning' | null = null;
  let configured = false;
  let writes = 0;
  let bootstraps = 0;
  let rejectLogout = true;
  let rejectRegister = true;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let status = 200;
    let body: unknown = {};
    if (path === '/api/v1/auth/register' && method === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({ name: 'Pessoa', email: 'new@example.com', password: 'pass12345' });
      if (rejectRegister) { status = 409; body = { error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } }; rejectRegister = false; }
      else { owner = 'new'; status = 201; body = { id: 'new', email: 'new@example.com', name: 'Pessoa' }; }
    } else if (path === '/api/v1/auth/me') {
      if (owner) body = { id: owner, email: `${owner}@example.com`, name: 'Pessoa' };
      else { status = 401; body = { error: { message: 'Sem sessão' } }; }
    } else if (path === '/api/v1/auth/login') { owner = 'returning'; body = { id: owner, email: 'returning@example.com', name: 'Outra pessoa' }; }
    else if (path === '/api/v1/auth/logout') {
      if (rejectLogout) { status = 503; body = { error: { message: 'Sem conexão' } }; rejectLogout = false; }
      else { owner = null; body = { ok: true }; }
    } else if (path === '/api/v1/portfolios') body = { portfolios: owner === 'new' && configured ? [{ id: portfolio, name: 'Principal', isDefault: true }] : owner === 'returning' ? [{ id: 'other-portfolio', name: 'Outra carteira', isDefault: true }] : [] };
    else if (path === '/api/v1/brokers') body = { brokers: [{ id: 'broker', name: 'XP', code: 'XP', isSeeded: true }] };
    else if (path === '/api/v1/accounts') body = { accounts: owner === 'new' && configured ? [{ id: account, portfolioId: portfolio, brokerId: 'broker', name: 'Principal' }] : owner === 'returning' ? [{ id: 'other-account', portfolioId: 'other-portfolio', brokerId: 'broker', name: 'Outra conta' }] : [] };
    else if (path === '/api/v1/onboarding' && method === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ portfolioName: 'Principal', brokerId: 'broker', accountName: 'Principal' });
      configured = true; bootstraps++; status = 201; body = { portfolioId: portfolio, accountId: account };
    } else if (path === '/api/v1/assets') body = { items: [asset], totalPages: 1 };
    else if (path === '/api/v1/transactions' && method === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({ type: 'buy', assetId, accountId: account, qty: '2', unitPriceCents: '1234' });
      writes++; status = 201; body = { id: 'entry' };
    } else if (path === '/api/v1/transactions') body = { items: [], page: 1, hasMore: false };
    else if (path === '/api/v1/holdings') body = { holdings: [] };
    else if (path === '/api/v1/portfolio/summary') body = { totalMarketValueCents: '0', totalCostBasisCents: '0', unrealizedPnlCents: '0', unpricedCostBasisCents: '0', holdingsCount: 0, currency: 'BRL', comparison: { kind: 'observed_value_including_cash_flows', currency: 'BRL', timezone: 'America/Sao_Paulo', currentAt: new Date().toISOString(), previousAt: null, previousDate: null, period: null, reason: 'NO_SNAPSHOT', hasStaleQuotes: false, total: null, cost: null, unrealized: null, dayMainChange: null } };
    else if (path === '/api/v1/portfolio/allocation') body = { byClass: [], bySector: [] };
    else if (path === '/api/v1/portfolio/snapshots') body = { snapshots: [] };
    else if (path === '/api/v1/market/indicators') body = { indicators: [] };
    else if (path === '/api/v1/market/benchmarks') body = { benchmarks: [] };
    else if (path === '/api/v1/dividends/agenda') body = { items: [], projections: [] };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/signup');
  await page.getByLabel('Nome').fill('Pessoa');
  await page.getByLabel('E-mail').fill('new@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('pass12345');
  await page.getByLabel('Confirmar senha').fill('pass12345');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('alert')).toContainText('já está cadastrado');
  await expect(page).toHaveURL(/signup/);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/onboarding/);
  await page.getByLabel('Nome da carteira').fill('Principal');
  await page.getByLabel('Corretora').selectOption('broker');
  await page.getByLabel('Nome da conta').fill('Principal');
  await page.getByRole('button', { name: 'Salvar carteira e conta' }).click();
  await expect(page.getByText('Carteira e conta prontas')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Carteira e conta prontas')).toBeVisible();
  expect(bootstraps).toBe(1);
  await page.getByRole('button', { name: 'Registrar primeira compra' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Ativo' }).fill('PETR4');
  await page.getByRole('option', { name: /PETR4/ }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Conta' }).selectOption(account);
  await page.getByRole('dialog').getByLabel('Quantidade').fill('2');
  await page.getByRole('dialog').getByLabel(/Preço unitário/).fill('12,34');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('status').getByText('Operação registrada com sucesso.')).toBeVisible();
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('alert')).toContainText('Verifique sua conexão');
  await expect(page).toHaveURL('/');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL('/login');
  await page.getByLabel('E-mail').fill('returning@example.com');
  await page.getByLabel('Senha').fill('pass12345');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('combobox', { name: 'Carteira' })).toContainText('Outra carteira');
  await expect(page.getByRole('combobox', { name: 'Carteira' })).not.toContainText('Principal');
});

test('expired session redirects from protected route; rejected login retains input and does not navigate', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Sessão expirada' } }) });
    } else if (path === '/api/v1/auth/login') {
      attempts++;
      await route.fulfill({ status: attempts === 1 ? 401 : 429, contentType: 'application/json', body: JSON.stringify({ error: { code: attempts === 1 ? 'INVALID_CREDENTIALS' : 'RATE_LIMITED', message: 'Rejected' } }) });
    } else await route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.goto('/holdings');
  await expect(page).toHaveURL('/login');
  await page.getByLabel('E-mail').fill('wrong@example.com');
  await page.getByLabel('Senha').fill('invalid');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  await expect(page.getByLabel('E-mail')).toHaveValue('wrong@example.com');
  await expect(page).toHaveURL('/login');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Muitas tentativas');
  await expect(page).toHaveURL('/login');
});

test('failed session verification hides private chrome until a successful retry', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') {
      await route.fulfill({ status: unavailable ? 503 : 200, contentType: 'application/json', body: JSON.stringify(unavailable ? { error: { message: 'Sem conexão' } } : { id: 'owner', email: 'owner@example.com' }) });
    } else if (path === '/api/v1/portfolios') await route.fulfill({ contentType: 'application/json', body: '{"portfolios":[]}' });
    else await route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.goto('/holdings');
  await expect(page.getByRole('alert')).toContainText('Não foi possível verificar sua sessão');
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
});

test('cached verified profile cannot keep old holdings visible after a protected 401', async ({ page }) => {
  let holdingsCalls = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/login' || path === '/api/v1/auth/me') {
      await route.fulfill({ contentType: 'application/json', body: '{"id":"owner","email":"owner@example.com","name":"Pessoa"}' });
    } else if (path === '/api/v1/portfolios') {
      await route.fulfill({ contentType: 'application/json', body: '{"portfolios":[{"id":"p1","name":"Carteira privada","isDefault":true}]}' });
    } else if (path === '/api/v1/accounts') {
      await route.fulfill({ contentType: 'application/json', body: '{"accounts":[{"id":"a1","name":"Conta privada","portfolioId":"p1"}]}' });
    } else if (path === '/api/v1/holdings') {
      holdingsCalls++;
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"code":"UNAUTHORIZED","message":"Expired"}}' });
    } else {
      const body = path === '/api/v1/transactions' ? { items: [], page: 1, hasMore: false }
        : path === '/api/v1/portfolio/summary' ? { totalMarketValueCents: '0', totalCostBasisCents: '0', unrealizedPnlCents: '0', unpricedCostBasisCents: '0', holdingsCount: 0, currency: 'BRL' }
        : path === '/api/v1/portfolio/allocation' ? { byClass: [], bySector: [] }
        : path === '/api/v1/portfolio/snapshots' ? { snapshots: [] }
        : path === '/api/v1/market/indicators' ? { indicators: [] }
        : path === '/api/v1/market/benchmarks' ? { benchmarks: [] }
        : path === '/api/v1/dividends/agenda' ? { items: [], projections: [] }
        : {};
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
  });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('owner@example.com');
  await page.getByLabel('Senha').fill('pass12345');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('combobox', { name: 'Carteira' })).toContainText('Carteira privada');
  await page.getByRole('link', { name: 'Holdings' }).click();
  await expect.poll(() => holdingsCalls).toBeGreaterThan(0);
  await expect(page).toHaveURL('/login');
  await expect(page.getByText('Carteira privada')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('investy-portfolio'))).toBeNull();
});

test('existing owner with portfolio but no account resumes bootstrap with custom broker without duplicate portfolio', async ({ page }) => {
  let accountsReady = false;
  let bootstraps = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === '/api/v1/auth/login' || path === '/api/v1/auth/me') body = { id: 'owner', email: 'owner@example.com' };
    else if (path === '/api/v1/portfolios') body = { portfolios: [{ id: 'existing-portfolio', name: 'Existente', isDefault: true }] };
    else if (path === '/api/v1/accounts') body = { accounts: accountsReady ? [{ id: 'new-account', name: 'Conta personalizada', portfolioId: 'existing-portfolio' }] : [] };
    else if (path === '/api/v1/brokers') body = { brokers: [] };
    else if (path === '/api/v1/onboarding') {
      expect(route.request().postDataJSON()).toEqual({ portfolioId: 'existing-portfolio', brokerName: 'Corretora Nova', brokerCode: 'nova', accountName: 'Conta personalizada' });
      bootstraps++; accountsReady = true;
      body = { portfolioId: 'existing-portfolio', accountId: 'new-account' };
    }
    await route.fulfill({ status: path === '/api/v1/onboarding' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('owner@example.com');
  await page.getByLabel('Senha').fill('pass12345');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/onboarding');
  await expect(page.getByText('Continuar a configuração da carteira Existente sem criar outra.')).toBeVisible();
  await page.getByLabel('Corretora').selectOption('custom');
  await page.getByLabel('Nome da nova corretora').fill('Corretora Nova');
  await page.getByLabel('Código da corretora (opcional)').fill('nova');
  await page.getByLabel('Nome da conta').fill('Conta personalizada');
  await page.getByRole('button', { name: 'Salvar carteira e conta' }).click();
  await expect(page.getByText('Carteira e conta prontas')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Carteira e conta prontas')).toBeVisible();
  expect(bootstraps).toBe(1);
});
