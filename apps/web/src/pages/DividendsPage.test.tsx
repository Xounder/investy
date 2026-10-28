import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DividendsPage from './DividendsPage';
import type { DividendItem } from '@/lib/dividends';

const assetId = '33333333-3333-4333-8333-333333333333';
const portfolioId = '11111111-1111-4111-8111-111111111111';
const record: DividendItem = {
  id: '44444444-4444-4444-8444-444444444444', portfolioId, assetId,
  symbol: 'HGLG11', assetName: 'FII Teste', assetClass: 'fii', kind: 'rendimento', category: 'income',
  exDate: '2026-10-02', paymentDate: null, rateCentsPerUnit: '125', eligibleQty: '10',
  currency: 'BRL', nativeAmountCents: '1250', amountCurrency: 'BRL', amountCents: '1250', amountCentsBRL: '1250', status: 'expected', source: 'provider', reconciliationRequired: false,
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(currency: 'BRL' | 'USD' = 'BRL', legacy = false) {
  const patches: Record<string, unknown>[] = [];
  const posts: Record<string, unknown>[] = [];
  const item = { ...record, currency, amountCurrency: currency, amountCentsBRL: currency === 'USD' || legacy ? null : '1250',
    ...(legacy ? { status: 'paid' as const, paymentDate: '2026-10-15', reconciliationRequired: true } : {}) };
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    let body: unknown = {};
    if (url.includes('/dividends/agenda')) body = { items: [item], projections: [{ assetId, nextExDate: '2026-11-02', cadence: 'monthly', confidence: 'high' }] };
    else if (url.includes('/dividends/history')) body = { year: 2026, month: null, totalCents: legacy ? '0' : currency === 'USD' ? '6563' : '1250', totalsIncomplete: legacy, months: [{ year: 2026, month: 10, totalCents: legacy ? '0' : currency === 'USD' ? '6563' : '1250', totalsIncomplete: legacy, items: legacy ? [item] : [{ ...item, status: 'paid', paymentDate: '2026-10-15', amountCents: currency === 'USD' ? '6563' : '1250', amountCurrency: 'BRL', amountCentsBRL: currency === 'USD' ? '6563' : '1250' }, { ...item, id: 'other', kind: 'amortizacao', category: 'return_of_capital', currency: 'BRL', amountCurrency: 'BRL', amountCents: '300' }] }] };
    else if (url.includes('/portfolios')) body = { portfolios: [{ id: portfolioId, name: 'Minha carteira', isDefault: true }] };
    else if (url.includes('/assets')) body = { items: [{ id: assetId, symbol: 'HGLG11', name: 'FII Teste', class: 'fii', currency }], totalPages: 1 };
    else if (options?.method === 'PATCH') {
      const patch = JSON.parse(String(options.body)) as Record<string, unknown>;
      patches.push(patch);
      item.status = patch.status as DividendItem['status'];
      if (patch.paymentDate) item.paymentDate = String(patch.paymentDate);
      if (patch.status === 'paid' && currency === 'USD') { item.amountCurrency = 'BRL'; item.amountCents = '6563'; item.amountCentsBRL = '6563'; }
      body = item;
    } else if (options?.method === 'POST') { posts.push(JSON.parse(String(options.body)) as Record<string, unknown>); body = item; }
    return new Response(JSON.stringify(body), { status: options?.method === 'POST' ? 201 : 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><DividendsPage /></QueryClientProvider>);
  return { patches, posts, fetchMock };
}

describe('dividend page', () => {
  it('shows ex-date agenda and FII projection, confirms pay date then marks paid', async () => {
    const { patches, fetchMock } = setup();
    expect(await screen.findByText('Data-com: 02/10/2026')).toBeTruthy();
    expect(screen.getByText(/Próxima data-com estimada: 02\/11\/2026/)).toBeTruthy();
    expect(screen.getByText(/não é garantia/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar data' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Data de pagamento de HGLG11'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar data' }));
    await waitFor(() => expect(patches).toEqual([{ status: 'confirmed', paymentDate: '2026-10-15' }]));
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como pago' }));
    await waitFor(() => expect(patches).toEqual([{ status: 'confirmed', paymentDate: '2026-10-15' }, { status: 'paid' }]));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/dividends/agenda?from=2026-01-01&to=2026-12-31'))).toBe(true);
  });

  it('pairs the payment date with its workflow status inside one accessible chip', async () => {
    const { patches } = setup();
    const expected = await screen.findByLabelText('Status Previsto; pagamento: data não informada');
    expect(expected.textContent).toContain('Previsto · Pagamento: data não informada');
    fireEvent.change(screen.getByLabelText('Data de pagamento de HGLG11'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar data' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    const confirmed = await screen.findByLabelText('Status Confirmado; pagamento: 15/10/2026');
    expect(confirmed.textContent).toContain('Confirmado · Pagamento: 15/10/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pago' }));
    const paid = await screen.findByLabelText('Status Pago; pagamento: 15/10/2026');
    expect(paid.textContent).toContain('Pago · Pagamento: 15/10/2026');
  });

  it('shows received income separate from return of capital in history', async () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico de renda' }));
    expect(await screen.findByText('Renda recebida')).toBeTruthy();
    expect(screen.getAllByText('R$ 12,50').length).toBeGreaterThan(0);
    expect(screen.getByText('Fora da renda')).toBeTruthy();
    expect(screen.getByText('R$ 3,00')).toBeTruthy();
  });

  it('submits manual dividend with decimal-string cents and portfolio', async () => {
    const { posts } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar provento' }));
    const form = await screen.findByRole('form', { name: 'Registrar provento' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Carteira' }), { target: { value: portfolioId } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Ativo' }), { target: { value: assetId } });
    fireEvent.change(screen.getByLabelText('Data-com'), { target: { value: '2026-10-02' } });
    fireEvent.change(screen.getByLabelText('Valor por cota (R$)'), { target: { value: '1,25' } });
    fireEvent.submit(form);
    await waitFor(() => expect(posts).toEqual([{ portfolioId, assetId, kind: 'dividend', exDate: '2026-10-02', rateCentsPerUnit: '125' }]));
  });

  it('requires original historical FX to pay USD, sending exact micro-BRL and displaying native versus posted BRL', async () => {
    const { patches } = setup('USD');
    expect(await screen.findByText(/US\$ 12,50 \(valor na moeda original\)/)).toBeTruthy();
    expect(screen.getByText(/Valor em BRL indisponível/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Data de pagamento de HGLG11'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar data' }));
    const pay = await screen.findByRole('button', { name: 'Marcar como pago' });
    expect(pay).toHaveProperty('disabled', true);
    const fx = screen.getByRole('textbox', { name: /Câmbio histórico na data do recebimento/ });
    fireEvent.change(fx, { target: { value: '0' } });
    expect(pay).toHaveProperty('disabled', true);
    fireEvent.change(fx, { target: { value: '5,250001' } });
    fireEvent.click(pay);
    await waitFor(() => expect(patches).toEqual([{ status: 'confirmed', paymentDate: '2026-10-15' }, { status: 'paid', fxRateToBRL: '5250001' }]));
    expect(await screen.findByText('Valor contabilizado em BRL: R$ 65,63')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico de renda' }));
    expect(await screen.findByText('Renda recebida')).toBeTruthy();
    expect(screen.getAllByText('R$ 65,63').length).toBeGreaterThan(0);
    expect(screen.getByText('Original: US$ 12,50')).toBeTruthy();
  });

  it('marks legacy paid item for reconciliation and shows incomplete zero as a partial total, not received income', async () => {
    setup('BRL', true);
    expect(await screen.findByText(/Pagamento legado sem vínculo confiável/)).toBeTruthy();
    expect(screen.getByText(/estimativa por posição, não é valor recebido/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico de renda' }));
    expect(await screen.findByText('Total parcial: R$ 0,00')).toBeTruthy();
    expect(screen.getByText(/Total incompleto: há pagamentos legados/)).toBeTruthy();
    expect(screen.getByText(/Total do mês incompleto/)).toBeTruthy();
    expect(screen.getByText(/Recebimento legado não conciliado; valor não confirmado/)).toBeTruthy();
    expect(screen.queryByText('R$ 12,50')).toBeNull();
  });
});
