import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterDrawer } from './RegisterDrawer';
import { useUiStore } from '@/stores/ui';

const portfolioId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useUiStore.getState().setRegisterFeedback(null);
  useUiStore.getState().setRegisterPrefill(null);
});

function setup(currency: string, reject = false) {
  const posts: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (input: string, options: RequestInit) => {
    let body: unknown;
    let status = 200;
    if (input.includes('/portfolios')) body = { portfolios: [{ id: portfolioId, name: 'Carteira', isDefault: true }] };
    else if (input.includes('/accounts')) body = { accounts: [{ id: accountId, portfolioId, name: 'Conta' }] };
    else if (input.includes('/assets/TEST')) body = { asset: { id: assetId, symbol: 'TEST', name: 'Ativo teste', currency, class: 'etf_us' }, lastQuote: null };
    else if (input.includes('/assets')) body = { items: [{ id: assetId, symbol: 'TEST', name: 'Ativo teste', currency, class: 'etf_us' }] };
    else if (input.includes('/transactions') && options?.method === 'POST') {
      posts.push(JSON.parse(String(options.body)) as Record<string, unknown>);
      if (reject) {
        status = 400;
        body = { error: { code: 'INVALID_EVENT', message: 'Evento recusado pela API', fields: ['qty: invalid'] } };
      } else body = { id: 'event', type: 'dividend', qty: '10', unitPriceCents: '123', feeCents: '0' };
    } else body = {};
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={['/global-action']}><Routes>
    <Route path="/global-action" element={<RegisterDrawer />} />
    <Route path="/holdings" element={<p>Posições</p>} />
  </Routes></MemoryRouter></QueryClientProvider></StrictMode>);
  return posts;
}

async function fillOperation(type: string) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Tipo' }), { target: { value: type } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Ativo' }), { target: { value: 'TEST' } });
  fireEvent.click(await screen.findByRole('option', { name: /TEST/ }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Conta' }).querySelectorAll('option').length).toBe(2));
  fireEvent.change(screen.getByRole('combobox', { name: 'Conta' }), { target: { value: accountId } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Quantidade' }), { target: { value: '10' } });
  fireEvent.change(screen.getByRole('textbox', { name: /por unidade/ }), { target: { value: '1,23' } });
}

describe('RegisterDrawer income events', () => {
  it('retains a stale sell prefill through StrictMode mounting', async () => {
    useUiStore.getState().setRegisterPrefill({ type: 'sell', assetId, accountId, symbol: 'TEST', qty: '10', priceCents: '123', isStale: true });
    setup('BRL');
    expect(await screen.findByText('Cotação desatualizada; confirme o preço antes de registrar.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Quantidade' }) as HTMLInputElement).value).toBe('10');
    expect((screen.getByRole('textbox', { name: /Preço unitário/ }) as HTMLInputElement).value).toBe('1,23');
    expect(await screen.findByText('Selecionado: TEST — Ativo teste')).toBeTruthy();
  });

  it('requires historical FX for USD dividend and writes canonical decimal-string money with zero fees', async () => {
    const posts = setup('USD');
    await fillOperation('dividend');
    expect(screen.getByRole('textbox', { name: 'Taxas' })).toHaveProperty('disabled', true);
    const fxInput = screen.getByRole('textbox', { name: /Câmbio histórico/ }) as HTMLInputElement;
    expect(fxInput.checkValidity()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(posts).toHaveLength(0);
    fireEvent.change(fxInput, { target: { value: '5,25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ type: 'dividend', assetId, accountId, qty: '10', unitPriceCents: '123', feeCents: '0', fxRateToBRL: '5250000' });
    await screen.findByText('Posições');
    expect(useUiStore.getState().registerFeedback).toBe('Operação registrada com sucesso.');
  });

  it('preserves JCP type and shows a nested server validation error', async () => {
    const posts = setup('BRL', true);
    await fillOperation('jcp');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Evento recusado pela API');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ type: 'jcp', qty: '10', unitPriceCents: '123', feeCents: '0' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
