import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const portfolioId = '11111111-1111-4111-8111-111111111111';

async function mockSettings(page: Page) {
  const calls: { path: string; method: string; body: Record<string, string> | null }[] = [];
  let profile = { id: 'u1', name: 'Ana', email: 'ana@example.com' };
  let portfolios = [{ id: portfolioId, name: 'Principal', isDefault: true }];
  let accounts: { id: string; name: string; portfolioId: string; brokerId: string; accountNumber: string | null }[] = [];
  let failCreateOnce = false;
  let overrides = [{ assetId: 'a1', symbol: 'PETR4', assetName: 'Petrobras', priceCents: '1234', currency: 'BRL', createdAt: '2026-10-01' },
    { assetId: 'a2', symbol: 'VALE3', assetName: 'Vale', priceCents: '2234', currency: 'BRL', createdAt: '2026-10-02' }];
  let erasureAllowed = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON() as Record<string, string> | null;
    calls.push({ path, method, body });
    if (path === '/api/v1/export') {
      const csv = url.searchParams.get('format') === 'csv';
      await route.fulfill({ status: 200, headers: { 'Content-Type': csv ? 'application/zip' : 'application/json', 'Content-Disposition': `attachment; filename="investy-export.${csv ? 'zip' : 'json'}"` }, body: csv ? 'ZIP_BYTES' : '{"portfolios":[]}' });
      return;
    }
    if (path === '/api/v1/settings/account' && method === 'DELETE') {
      if (!erasureAllowed) { await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Senha incorreta' } }) }); return; }
      await route.fulfill({ status: 204 }); return;
    }
    let result: unknown = {};
    let status = 200;
    if (path === '/api/v1/auth/me') {
      if (method === 'PATCH') profile = { ...profile, name: body!.name!, email: body!.email! };
      result = profile;
    } else if (path === '/api/v1/portfolios') {
      if (method === 'POST') { portfolios = [...portfolios, { id: '22222222-2222-4222-8222-222222222222', name: body!.name!, isDefault: false }]; status = 201; result = portfolios[1]; }
      else result = { portfolios };
    } else if (path.startsWith('/api/v1/portfolios/')) {
      if (method === 'PATCH') { portfolios = portfolios.map((p) => path.endsWith(p.id) ? { ...p, name: body!.name ?? p.name, isDefault: body!.isDefault === undefined ? p.isDefault : Boolean(body!.isDefault) } : p); result = portfolios.find((p) => path.endsWith(p.id)); }
      else if (method === 'DELETE') { portfolios = portfolios.filter((p) => !path.endsWith(p.id)); status = 204; }
    } else if (path === '/api/v1/brokers') result = { brokers: [{ id: 'b1', name: 'Corretora', isSeeded: true }] };
    else if (path === '/api/v1/accounts') {
      if (method === 'POST' && failCreateOnce) { failCreateOnce = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Tente outra vez' } }) }); return; }
      if (method === 'POST') { const entry = { id: '33333333-3333-4333-8333-333333333333', name: body!.name!, portfolioId: body!.portfolioId!, brokerId: body!.brokerId!, accountNumber: null }; accounts = [...accounts, entry]; result = entry; status = 201; }
      else result = { accounts: accounts.filter((account) => account.portfolioId === url.searchParams.get('portfolioId')) };
    } else if (path.startsWith('/api/v1/accounts/') && method === 'DELETE') { accounts = accounts.filter((account) => !path.endsWith(account.id)); status = 204; }
    else if (path === '/api/v1/transactions') result = { items: [], page: 1, hasMore: false };
    else if (path === '/api/v1/assets') result = { items: [], totalPages: 1 };
    else if (path === '/api/v1/settings/backups') result = { status: 'verified', workerStatus: 'verified', lastBackup: { verifiedAt: '2026-10-20T12:00:00Z', bytes: '1234', sha256: 'abc' }, retentionNote: 'Backups locais não são removidos por prazo.' };
    else if (path === '/api/v1/settings/overrides') result = { overrides };
    else if (path.endsWith('/override') && method === 'DELETE') { overrides = overrides.filter((item) => !path.includes(item.symbol)); result = { ok: true }; }
    if (status === 204) await route.fulfill({ status });
    else await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
  });
  return { calls, allowErase: () => { erasureAllowed = true; }, failNextAccountCreate: () => { failCreateOnce = true; } };
}

test('account create failure retries and both drawer and journal refresh cached account lists after create/delete', async ({ page }) => {
  const { calls, failNextAccountCreate } = await mockSettings(page);
  await page.goto('/transactions');
  await expect(page.getByRole('combobox', { name: 'Conta' }).locator('option')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Registrar' }).click();
  const drawer = page.getByRole('dialog', { name: 'Registrar operação' });
  await expect(drawer.getByRole('combobox', { name: 'Conta' }).locator('option')).toHaveCount(1);
  await drawer.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('link', { name: 'Configurações' }).click();
  const section = page.getByRole('heading', { name: 'Corretoras e contas' }).locator('..');
  await section.getByRole('combobox', { name: 'Carteira' }).selectOption(portfolioId);
  await section.getByRole('combobox', { name: 'Corretora' }).selectOption('b1');
  await section.getByLabel('Nome da conta').fill('Conta nova');
  failNextAccountCreate();
  await section.getByRole('button', { name: 'Adicionar conta' }).click();
  await expect(section.getByText('Tente outra vez')).toBeVisible();
  await section.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(section.getByText(/Conta nova ·/)).toBeVisible();
  await page.getByRole('link', { name: 'Transações' }).click();
  await expect(page.getByRole('combobox', { name: 'Conta' }).locator('option')).toHaveCount(2);
  await page.getByRole('button', { name: '+ Registrar' }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Conta' }).locator('option')).toHaveCount(2);
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('link', { name: 'Configurações' }).click();
  await section.getByRole('button', { name: 'Excluir' }).click();
  await section.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(section.getByText('Nenhuma conta. Adicione uma conta abaixo.')).toBeVisible();
  await page.getByRole('link', { name: 'Transações' }).click();
  await expect(page.getByRole('combobox', { name: 'Conta' }).locator('option')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Registrar' }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Conta' }).locator('option')).toHaveCount(1);
  expect(calls.filter((call) => call.path === '/api/v1/accounts' && call.method === 'POST')).toHaveLength(2);
});

test('settings persists profile and portfolio edits, downloads JSON and CSV ZIP, and confirms override removal', async ({ page }) => {
  const { calls } = await mockSettings(page);
  await page.goto('/settings');
  await expect(page.getByText(/1234 bytes/)).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Ana Maria');
  await page.getByLabel('E-mail', { exact: true }).fill('nova@example.com');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.getByText('Perfil atualizado.')).toBeVisible();
  expect(calls.some((c) => c.path === '/api/v1/auth/me' && c.method === 'PATCH' && c.body?.email === 'nova@example.com')).toBe(true);
  await page.reload();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('nova@example.com');
  const portfolios = page.getByRole('heading', { name: 'Carteiras' }).locator('..');
  await portfolios.getByLabel('Nome da carteira').fill('Nova');
  await portfolios.getByRole('button', { name: 'Criar carteira' }).click();
  await expect(portfolios.getByText('Nova', { exact: true })).toBeVisible();
  await portfolios.getByRole('button', { name: 'Editar' }).last().click();
  await portfolios.getByLabel('Nome da carteira').fill('Renomeada');
  await portfolios.getByRole('button', { name: 'Salvar carteira' }).click();
  await expect(portfolios.getByText('Renomeada', { exact: true })).toBeVisible();
  for (const [label, filename, contents] of [['Exportar JSON', 'investy-export.json', '"portfolios"'], ['Exportar CSV', 'investy-export.zip', 'ZIP_BYTES']] as const) {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    expect((await readFile(await download.path())).toString()).toContain(contents);
  }
  const overrides = page.getByRole('heading', { name: 'Preços manuais' }).locator('..');
  await overrides.getByRole('button', { name: 'Remover', exact: true }).first().click();
  expect(calls.some((c) => c.path === '/api/v1/assets/PETR4/override' && c.method === 'DELETE')).toBe(false);
  await overrides.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(overrides.getByText(/PETR4 ·/)).toHaveCount(0);
  await overrides.getByRole('button', { name: 'Remover todos' }).click();
  await overrides.getByRole('button', { name: 'Confirmar remoção' }).click();
  await expect(overrides.getByText('Nenhum preço manual cadastrado.')).toBeVisible();
});

test('erasure requires current email, password and explicit checkbox, handles rejected password before 204 redirect', async ({ page }) => {
  const { calls, allowErase } = await mockSettings(page);
  await page.goto('/settings');
  const danger = page.getByRole('heading', { name: 'Zona de perigo' }).locator('..');
  const erase = danger.getByRole('button', { name: 'Apagar conta definitivamente' });
  await expect(erase).toBeDisabled();
  await danger.getByLabel(/Digite seu e-mail exatamente/).fill('wrong@example.com');
  await danger.getByLabel('Senha atual').fill('not-my-password');
  await danger.getByRole('checkbox').check();
  await expect(erase).toBeDisabled();
  await danger.getByLabel(/Digite seu e-mail exatamente/).fill('ana@example.com');
  await expect(erase).toBeEnabled();
  await erase.click();
  await expect(danger.getByText('Senha incorreta')).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  const retry = danger.getByRole('button', { name: 'Tentar novamente' });
  await danger.getByRole('checkbox').uncheck();
  await expect(retry).toBeDisabled();
  await danger.getByRole('checkbox').check();
  allowErase();
  await retry.click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls.filter((c) => c.path === '/api/v1/settings/account' && c.method === 'DELETE')).toHaveLength(2);
  expect(calls.find((c) => c.path === '/api/v1/settings/account')?.body).toEqual({ email: 'ana@example.com', password: 'not-my-password' });
});
