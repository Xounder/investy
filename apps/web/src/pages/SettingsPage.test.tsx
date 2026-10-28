import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup({ emptyBrokers = false }: { emptyBrokers?: boolean } = {}) {
  const requests: { url: string; method: string; body: unknown }[] = [];
  let portfolios = [{ id: 'p1', name: 'Principal', isDefault: true }];
  let accounts = [{ id: 'a1', portfolioId: 'p1', brokerId: 'b1', name: 'Conta antiga', accountNumber: null }];
  let brokers = emptyBrokers ? [] : [{ id: 'b1', name: 'Corretora', isSeeded: true }];
  let overrides = [{ assetId: 'x1', symbol: 'PETR4', assetName: 'Petrobras', priceCents: '1299', currency: 'BRL', createdAt: '2026-01-01' }];
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) as Record<string, string> : null;
    requests.push({ url, method, body });
    if (url.includes('/export')) return new Response('zip content', { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="investy-export.zip"' } });
    if (url.includes('/auth/me')) return Response.json(method === 'PATCH' ? { id: 'u1', ...body } : { id: 'u1', name: 'Ana', email: 'ana@example.com' });
    if (url.includes('/portfolios')) {
      if (method === 'POST') {
        if (body!.name === 'Falha') return Response.json({ error: { message: 'Não foi possível criar a carteira' } }, { status: 503 });
        const created = { id: `p${portfolios.length + 1}`, name: body!.name!, isDefault: false };
        portfolios = [...portfolios, created];
        return Response.json(created, { status: 201 });
      }
      if (method === 'DELETE') { portfolios = portfolios.filter((p) => !url.endsWith(p.id)); return new Response(null, { status: 204 }); }
      return Response.json({ portfolios });
    }
    if (url.includes('/brokers')) {
      if (method === 'POST') {
        if (body!.name === 'Erro') return Response.json({ error: { message: 'Código duplicado' } }, { status: 409 });
        const created = { id: 'b2', name: body!.name!, isSeeded: false };
        brokers = [...brokers, created];
        return Response.json(created, { status: 201 });
      }
      return Response.json({ brokers });
    }
    if (url.includes('/accounts')) {
      if (method === 'POST') { accounts = [...accounts, { id: 'a2', portfolioId: body!.portfolioId!, brokerId: body!.brokerId!, name: body!.name!, accountNumber: null }]; return Response.json(accounts[1], { status: 201 }); }
      if (method === 'DELETE') { accounts = []; return new Response(null, { status: 204 }); }
      return Response.json({ accounts: accounts.filter((account) => url.includes(account.portfolioId)) });
    }
    if (url.includes('/backups')) return Response.json({ status: 'not_configured', workerStatus: 'not_configured', lastBackup: null, retentionNote: 'Retenção não configurada' });
    if (url.includes('/overrides')) return Response.json({ overrides });
    if (url.includes('/assets/PETR4/override')) { overrides = []; return Response.json({ ok: true }); }
    if (url.includes('/settings/account')) return new Response(null, { status: 204 });
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><SettingsPage /></QueryClientProvider></MemoryRouter>);
  return { requests };
}

describe('settings', () => {
  it('explains an empty broker catalog and retries a failed creation without losing the form', async () => {
    const { requests } = setup({ emptyBrokers: true });
    expect(await screen.findByText('Nenhuma corretora disponível. Cadastre sua primeira corretora abaixo.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nova corretora'), { target: { value: 'Erro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar corretora' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Código duplicado');
    expect(alert.querySelector('button')?.textContent).toBe('Tentar novamente');
    fireEvent.change(screen.getByLabelText('Nova corretora'), { target: { value: 'Corretora nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect((await screen.findByText(/Personalizada/)).parentElement?.textContent).toContain('Corretora nova');
    expect(screen.queryByText('Nenhuma corretora disponível. Cadastre sua primeira corretora abaixo.')).toBeNull();
    expect(requests.filter((r) => r.url === '/api/v1/brokers' && r.method === 'POST').map((r) => (r.body as { name: string }).name)).toEqual(['Erro', 'Corretora nova']);
  });
  it('renders server status and updates profile with persisted server response', async () => {
    const { requests } = setup();
    expect(await screen.findByText('Retenção não configurada')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Maria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar perfil' }));
    await waitFor(() => expect(requests).toContainEqual({ url: '/api/v1/auth/me', method: 'PATCH', body: { name: 'Ana Maria', email: 'ana@example.com' } }));
    expect(await screen.findByText('Perfil atualizado.')).toBeTruthy();
  });

  it('shows verified backup metadata without mistaking a failed latest run for a verified one', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/backups')) return Response.json({ status: 'failed', workerStatus: 'failed', lastBackup: { verifiedAt: '2026-10-20T12:00:00Z', bytes: '1234', sha256: 'abc' }, retentionNote: 'Backup local sem retenção garantida.' });
      if (url.includes('/auth/me')) return Response.json({ id: 'u1', name: 'Ana', email: 'ana@example.com' });
      if (url.includes('/portfolios')) return Response.json({ portfolios: [] });
      if (url.includes('/brokers')) return Response.json({ brokers: [] });
      if (url.includes('/overrides')) return Response.json({ overrides: [] });
      throw new Error(`Unexpected ${url}`);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><SettingsPage /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText(/1234 bytes/)).toBeTruthy();
    expect(screen.getByText('Falhou')).toBeTruthy();
    expect(screen.getByText(/último backup não foi concluído/)).toBeTruthy();
    expect(screen.getByText('Backup local sem retenção garantida.')).toBeTruthy();
  });

  it('reports an unavailable backup artifact as unrestorable, not as no backup ever created', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/backups')) return Response.json({ status: 'unavailable', workerStatus: 'unavailable', reason: 'artifact_missing_or_corrupt', lastBackup: null, retentionNote: 'Persistência após troca de instância não é garantida.' });
      if (url.includes('/auth/me')) return Response.json({ id: 'u1', name: 'Ana', email: 'ana@example.com' });
      if (url.includes('/portfolios')) return Response.json({ portfolios: [] });
      if (url.includes('/brokers')) return Response.json({ brokers: [] });
      if (url.includes('/overrides')) return Response.json({ overrides: [] });
      throw new Error(`Unexpected ${url}`);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><SettingsPage /></QueryClientProvider></MemoryRouter>);
    expect((await screen.findByText('Arquivo indisponível')).parentElement?.textContent).toBe('Status: Arquivo indisponível');
    expect(screen.getByText('Último backup verificado: Arquivo indisponível')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Não há cópia verificada acessível para restauração');
    expect(screen.queryByText('Nenhum backup verificado registrado')).toBeNull();
    expect(screen.queryByText('Verificado')).toBeNull();
    expect(screen.getByText('Persistência após troca de instância não é garantida.')).toBeTruthy();
  });

  it('creates a portfolio and account, requires confirmation before deleting portfolio and override', async () => {
    const { requests } = setup();
    await screen.findByRole('button', { name: 'Criar carteira' });
    fireEvent.change(screen.getByLabelText('Nome da carteira'), { target: { value: 'Nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar carteira' }));
    expect(await screen.findByText('Nova')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome da conta'), { target: { value: 'Conta nova' } });
    fireEvent.change(screen.getByLabelText('Carteira'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Corretora'), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar conta' }));
    expect(await screen.findByText(/Conta nova ·/)).toBeTruthy();
    const deletesBefore = requests.filter((r) => r.method === 'DELETE').length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir' })[0]!);
    expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(deletesBefore);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(requests.some((r) => r.url === '/api/v1/portfolios/p1' && r.method === 'DELETE')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(requests.some((r) => r.url.includes('/assets/PETR4/override'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(requests.some((r) => r.url === '/api/v1/assets/PETR4/override' && r.method === 'DELETE')).toBe(true));
  });

  it('retries a failed portfolio mutation without displaying success from a previous action', async () => {
    const { requests } = setup();
    await screen.findByRole('button', { name: 'Criar carteira' });
    fireEvent.change(screen.getByLabelText('Nome da carteira'), { target: { value: 'Boa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar carteira' }));
    expect(await screen.findByText('Carteira criada.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome da carteira'), { target: { value: 'Falha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar carteira' }));
    expect(await screen.findByText('Não foi possível criar a carteira')).toBeTruthy();
    expect(screen.queryByText('Carteira criada.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Nome da carteira'), { target: { value: 'Recuperada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Recuperada')).toBeTruthy();
    expect(requests.filter((r) => r.url === '/api/v1/portfolios' && r.method === 'POST').map((r) => (r.body as { name: string }).name)).toEqual(['Boa', 'Falha', 'Recuperada']);
  });

  it('gates erasure on email, password and checkbox; sends both credentials', async () => {
    const { requests } = setup();
    await screen.findByText('Retenção não configurada');
    const erase = screen.getByRole('button', { name: 'Apagar conta definitivamente' });
    fireEvent.change(screen.getByLabelText(/Digite seu e-mail exatamente/), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'secreta' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(erase).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText(/Digite seu e-mail exatamente/), { target: { value: 'ana@example.com' } });
    expect(erase).toHaveProperty('disabled', false);
    fireEvent.click(erase);
    await waitFor(() => expect(requests).toContainEqual({ url: '/api/v1/settings/account', method: 'DELETE', body: { email: 'ana@example.com', password: 'secreta' } }));
  });
});
