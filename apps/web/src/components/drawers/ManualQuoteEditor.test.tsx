import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManualQuoteEditor } from './ManualQuoteEditor';

afterEach(() => vi.unstubAllGlobals());

describe('manual quote editor', () => {
  it('writes native USD cents, invalidates valuation consumers, confirms clear and keeps errors recoverable', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 600_000 } } });
    const keys = [['asset', 'AAPL'], ['position', 'asset-1'], ['holdings', null], ['dashboard-summary', 'p1'], ['reports-snapshots', 'p1'], ['settings', 'overrides'], ['market', 'AAPL']];
    for (const key of keys) client.setQueryData(key, 'old');
    const calls: Array<{ method: string; body?: { priceCents: number; currency: string } }> = [];
    let reject = true;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      calls.push({ method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined });
      if (reject) return Response.json({ error: { message: 'Tente novamente' } }, { status: 503 });
      return Response.json({ ok: true });
    }));
    const props = { symbol: 'AAPL', currency: 'USD', override: { priceCents: '100', currency: 'USD', createdAt: '2026-01-01' }, provider: { priceCents: '90', currency: 'USD', isStale: true } };
    const view = render(<QueryClientProvider client={client}><ManualQuoteEditor {...props} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('Preço por unidade (USD)'), { target: { value: '1,001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar preço manual' }));
    expect(calls).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Preço por unidade (USD)'), { target: { value: '1.234,56' } });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar preço manual' }));
    await screen.findByText('Tente novamente');
    expect(client.getQueryState(keys[0]!)?.isInvalidated).toBe(false);
    reject = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByText('Preço manual salvo.');
    expect(calls.filter((call) => call.method === 'PATCH').at(-1)?.body).toEqual({ priceCents: 123456, currency: 'USD' });
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    view.rerender(<QueryClientProvider client={client}><ManualQuoteEditor {...props} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Remover preço manual' }));
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1));
    await screen.findByText('Preço manual removido.');
  });
});
