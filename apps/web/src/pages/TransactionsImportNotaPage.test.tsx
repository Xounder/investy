import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TransactionsImportNotaPage from './TransactionsImportNotaPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const broker = 'b1';
const account = 'a1';
const nota = { brokerId: broker, notaNumber: 'N-1', tradeDate: '2026-01-15',
  items: [{ direction: 'C', symbol: 'PETR4', qty: '1', unitPriceCents: '2500', dayTrade: false }],
  fees: { liquidacao: '1', corretagem: '0', emolumentos: '0', iss: '0', irrf: '0' },
  rateio: ['1'], warnings: [], importToken: 'token-1' };
const text = 'Corretora: Corretora 1\nNúmero Nota: N-1\nData Pregão: 15/01/2026\nC PETR4 1 25,00';
const file = (name: string) => new File([text], name, { type: 'text/plain' });

function setup(options: { preview?: (form: FormData) => Promise<Response>; confirm?: () => Promise<Response>;
  history?: () => Promise<Response>; prefetchedMetadata?: boolean } = {}) {
  const requests: { url: string; body?: FormData | string }[] = [];
  const calls = { summary: 0, holdings: 0 };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, body: init?.body as FormData | string | undefined });
    if (url.endsWith('/portfolios')) return Response.json({ portfolios: [{ id: 'p1', name: 'Principal', isDefault: true }] });
    if (url.includes('/accounts')) return Response.json({ accounts: [{ id: account, name: 'Conta 1', brokerId: broker, portfolioId: 'p1' }] });
    if (url.endsWith('/brokers')) return Response.json({ brokers: [{ id: broker, name: 'Corretora 1' }, { id: 'b2', name: 'Corretora 2' }] });
    if (url.endsWith('/nota/history')) return options.history?.() ?? Response.json({ items: [] });
    if (url.endsWith('/nota/preview')) return options.preview?.(init!.body as FormData) ?? Response.json({ nota });
    if (url.endsWith('/nota/confirm')) return options.confirm?.() ?? Response.json({ created: 1, holdings: [{ id: 'h1', accountId: account, assetId: 'x1', qty: '13' }] }, { status: 201 });
    if (url.includes('/assets?')) return Response.json({ items: [{ id: 'x1', symbol: 'PETR4', name: 'Petrobras' }], totalPages: 1 });
    if (url.includes('/dashboard/summary')) { calls.summary++; return Response.json({ ok: true }); }
    if (url.includes('/holdings')) { calls.holdings++; return Response.json({ holdings: [] }); }
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (options.prefetchedMetadata) {
    client.setQueryData(['portfolios'], [{ id: 'p1', name: 'Principal', isDefault: true }]);
    client.setQueryData(['settings', 'brokers'], [{ id: broker, name: 'Corretora 1' }, { id: 'b2', name: 'Corretora 2' }]);
    client.setQueryData(['import-accounts', ['p1']], [{ id: account, name: 'Conta 1', brokerId: broker, portfolioId: 'p1' }]);
  }
  function Observers() {
    useQuery({ queryKey: ['dashboard-summary', 'p1'], queryFn: () => fetch('/api/v1/dashboard/summary') });
    useQuery({ queryKey: ['holdings', null], queryFn: () => fetch('/api/v1/holdings') });
    return null;
  }
  render(<MemoryRouter><QueryClientProvider client={client}><Observers /><TransactionsImportNotaPage /></QueryClientProvider></MemoryRouter>);
  return { requests, calls };
}

async function selectAccount() {
  await screen.findByRole('option', { name: 'Corretora 1' });
  fireEvent.change(screen.getByLabelText('Corretora'), { target: { value: broker } });
  await screen.findByRole('option', { name: 'Conta 1' });
  fireEvent.change(screen.getByLabelText('Conta'), { target: { value: account } });
}

describe('nota import page', () => {
  it('switches file/text input, discards token on file/account/broker changes and ignores late preview', async () => {
    const resolvePreviews: Array<(response: Response) => void> = [];
    const { requests } = setup({ prefetchedMetadata: true, preview: () => new Promise((resolve) => { resolvePreviews.push(resolve); }) });
    await selectAccount();
    fireEvent.change(screen.getByLabelText('Arquivo da nota'), { target: { files: [file('A.txt')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar nota' }));
    await waitFor(() => expect(resolvePreviews).toHaveLength(1));
    fireEvent.change(screen.getByLabelText(/^Arquivo da nota/), { target: { files: [file('B.txt')] } });
    await act(async () => { resolvePreviews[0]!(Response.json({ nota: { ...nota, notaNumber: 'A', importToken: 'token-A' } })); });
    expect(screen.queryByText('Revisar nota A')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar nota' }));
    await waitFor(() => expect(resolvePreviews).toHaveLength(2));
    await act(async () => { resolvePreviews[1]!(Response.json({ nota: { ...nota, notaNumber: 'B', importToken: 'token-B' } })); });
    expect(screen.getByText('Revisar nota B')).toBeTruthy();
    expect(screen.queryByText('Revisar nota A')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await waitFor(() => expect(requests.filter((request) => request.url.endsWith('/nota/confirm')).map((request) => request.body))
      .toEqual([JSON.stringify({ importToken: 'token-B' })]));
    expect(await screen.findByText(/1 registros importados/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar nota' }));
    await waitFor(() => expect(resolvePreviews).toHaveLength(3));
    await act(async () => { resolvePreviews[2]!(Response.json({ nota: { ...nota, notaNumber: 'C', importToken: 'token-C' } })); });
    expect(screen.getByText('Revisar nota C')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Conta'), { target: { value: '' } });
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Corretora'), { target: { value: 'b2' } });
    expect(screen.getByLabelText('Conta')).toHaveProperty('value', '');
    fireEvent.click(screen.getByRole('radio', { name: 'Colar texto' }));
    expect(screen.getByLabelText('Texto da nota')).toBeTruthy();
    expect(screen.queryByLabelText('Arquivo da nota')).toBeNull();
    expect(requests.filter((request) => request.url.endsWith('/nota/confirm'))).toHaveLength(1);
  });

  it('blocks warnings, clears token after reconciliation error and allows re-preview with preserved text', async () => {
    let previews = 0;
    const { requests } = setup({ preview: async () => Response.json({ nota: { ...nota, warnings: ++previews === 1
      ? [{ type: 'DUPLICATE', message: 'Nota já importada', details: 'reference-1' }] : [] } }),
    confirm: async () => Response.json({ error: { code: 'RECONCILIATION', message: 'Conciliação pendente' } }, { status: 409 }) });
    await selectAccount();
    fireEvent.click(screen.getByRole('radio', { name: 'Colar texto' }));
    fireEvent.change(screen.getByLabelText('Texto da nota'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar nota' }));
    expect(await screen.findByText(/Nota já importada/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar importação' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar nota' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar importação' })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    expect(await screen.findByText(/Conciliação pendente.*nova prévia/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).toBeNull();
    expect(screen.getByLabelText('Texto da nota')).toHaveProperty('value', text);
    expect(requests.filter((request) => request.url.endsWith('/nota/confirm'))).toHaveLength(1);
  });

  it('renders confirmed history, returned holdings and refetches mounted dashboard and holding observers', async () => {
    const { calls, requests } = setup({ history: async () => Response.json({ items: [{ id: 'r1', brokerId: broker,
      notaNumber: 'N-1', tradeDate: '2026-01-15T00:00:00Z', status: 'confirmed', createdAt: '2026-01-15T00:00:00Z' }] }) });
    await selectAccount();
    expect(await screen.findByText(/Confirmada · Referência r1/)).toBeTruthy();
    await waitFor(() => expect(calls).toEqual({ summary: 1, holdings: 1 }));
    fireEvent.click(screen.getByRole('radio', { name: 'Colar texto' }));
    fireEvent.change(screen.getByLabelText('Texto da nota'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar nota' }));
    expect(await screen.findByRole('button', { name: 'Confirmar importação' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    expect(await screen.findByText(/PETR4 · Conta Conta 1 · Saldo 13 unidades/)).toBeTruthy();
    await waitFor(() => expect(calls).toEqual({ summary: 2, holdings: 2 }));
    expect(requests.find((request) => request.url.endsWith('/nota/confirm'))?.body).toBe(JSON.stringify({ importToken: 'token-1' }));
  });

  it('shows empty history and retries a failed history request', async () => {
    let attempts = 0;
    setup({ history: async () => ++attempts === 1 ? Response.json({ error: { message: 'Histórico indisponível' } }, { status: 503 }) : Response.json({ items: [] }) });
    const history = await screen.findByRole('heading', { name: 'Histórico de notas' });
    const section = history.closest('section')!;
    expect(await within(section).findByText(/Histórico indisponível/)).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Tentar novamente' }));
    expect(await within(section).findByText('Nenhuma nota importada ainda.')).toBeTruthy();
    expect(attempts).toBe(2);
  });
});
