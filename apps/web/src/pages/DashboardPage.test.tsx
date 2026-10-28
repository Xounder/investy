import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { allocationPercentages, groupSlices } from '@/components/dashboard/DashboardWidgets';
import { performanceRows } from '@/components/dashboard/PerformanceChart';
import { useUiStore } from '@/stores/ui';

const id = '11111111-1111-4111-8111-111111111111';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useUiStore.setState({ activePortfolioId: null }); });

function mount(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const requests: string[] = [];
  const responses: Record<string, unknown> = {
    '/portfolios': { portfolios: [{ id, name: 'Principal', isDefault: true }] },
    '/portfolio/summary': { totalMarketValueCents: '123456', totalCostBasisCents: '100000', unrealizedPnlCents: '23456', unpricedCostBasisCents: '0', holdingsCount: 1, currency: 'BRL', comparison: { kind: 'observed_value_including_cash_flows', currency: 'BRL', timezone: 'America/Sao_Paulo', currentAt: '2026-10-24T12:00:00Z', previousAt: '2026-10-23T12:00:00Z', previousDate: '2026-10-23', period: 'since_snapshot', reason: null, hasStaleQuotes: true, total: { amountCents: '3456', percent: 2.88 }, cost: { amountCents: '1000', percent: 1.01 }, unrealized: { amountCents: '2456', percent: null }, dayMainChange: { amountCents: '3456', percent: 2.88 } } },
    '/portfolio/allocation': { byClass: [{ key: 'acao', valueCents: '123456', percent: 100 }], bySector: [{ key: 'Energia', valueCents: '123456', percent: 100 }] },
    '/portfolio/snapshots': { snapshots: [] },
    '/holdings': { holdings: [{ isStale: true }] },
    '/market/indicators': { indicators: [{ symbol: 'IBOV', value: 123456, date: '2020-01-01' }] },
    '/market/benchmarks/cdi-index': { cdiIndex: { symbol: 'CDI', source: 'BCB_SGS_12', rateUnit: 'percent_per_business_day', indexUnit: 'base_100', range: '1m', requestedStartDate: '2026-09-24', requestedEndDate: '2026-10-24', baseDate: null, lastObservationDate: null, coverage: 'UNAVAILABLE', reason: 'PROVIDER_UNAVAILABLE_OR_INCOMPLETE', fetchedAt: null, indexSeries: [] } },
    '/market/benchmarks': { benchmarks: [] },
    '/dividends/agenda': { items: [], projections: [] },
    '/transactions': { items: [], page: 1, hasMore: false },
    ...overrides,
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url);
    const key = Object.keys(responses).find((path) => url.includes(`/v1${path}`));
    const body = key ? responses[key] : undefined;
    return new Response(JSON.stringify(body ?? {}), { status: body === null ? 503 : 200 });
  }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>);
  return requests;
}

describe('dashboard hub', () => {
  it('fetches scoped aggregates and displays exact monetary values, unavailable daily return and stale indicator', async () => {
    const requests = mount();
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Indicadores da carteira' })).getByText('R$ 1.234,56')).toBeTruthy());
    const kpis = screen.getByRole('region', { name: 'Indicadores da carteira' });
    expect(within(kpis).getByText('R$ 1.000,00')).toBeTruthy();
    expect(within(kpis).getByText('+R$ 234,56')).toBeTruthy();
    expect(within(kpis).getByText('+R$ 34,56')).toBeTruthy();
    expect(within(kpis).getByText(/Desde 23\/10\/2026/)).toBeTruthy();
    expect(within(kpis).getAllByText(/R\$ 34,56/).length).toBeGreaterThan(1);
    expect(within(kpis).getByText(/há cotações desatualizadas/)).toBeTruthy();
    expect(await screen.findByLabelText('IBOV: desatualizado')).toBeTruthy();
    expect(requests.some((path) => path.includes(`/portfolio/summary?portfolioId=${id}`))).toBe(true);
    expect(requests.some((path) => path.includes(`/portfolio/allocation?portfolioId=${id}`))).toBe(true);
    expect(requests.some((path) => path.includes('/market/benchmarks?series=IBOV,IFIX,SPX'))).toBe(true);
  });

  it('groups small allocation slices and only compares actual benchmark dates', () => {
    expect(groupSlices([{ key: 'acao', valueCents: '9700', percent: 97 }, { key: 'etf', valueCents: '200', percent: 2 }, { key: 'fii', valueCents: '100', percent: 1 }])).toEqual([{ key: 'acao', valueCents: '9700', percent: 97 }, { key: 'Outros', valueCents: '300', percent: 3 }]);
    const snapshots = [{ date: '2026-09-02', totalValueCents: '10000', costBasisCents: '10000' }, { date: '2026-10-02', totalValueCents: '11000', costBasisCents: '10000' }];
    const indexes = [{ symbol: 'IBOV', series: [{ date: '2026-09-02', value: 50 }, { date: '2026-10-02', value: 60 }] }, { symbol: 'CDI', series: [{ date: '2026-09-02', value: 13 }, { date: '2026-10-02', value: 14 }] }];
    const cdi = { symbol: 'CDI' as const, source: 'BCB_SGS_12' as const, rateUnit: 'percent_per_business_day' as const, indexUnit: 'base_100' as const, range: '3m' as const, requestedStartDate: '2026-08-01', requestedEndDate: '2026-10-24', baseDate: '2026-09-02', lastObservationDate: '2026-10-02', coverage: 'COMPLETE_THROUGH_LAST_OBSERVATION' as const, reason: null, fetchedAt: '2026-10-03T00:00:00Z', indexSeries: [{ date: '2026-09-02', value: 100 }, { date: '2026-10-02', value: 101 }] };
    const result = performanceRows(snapshots, indexes, 'quarterly', cdi);
    expect(result.cdiAligned).toBe(true);
    expect(result.rows).toMatchObject([{ Carteira: 100, CDI: 100, IBOV: 100 }, { Carteira: 110, CDI: 101, IBOV: 120 }]);
    expect(performanceRows(snapshots, indexes, 'quarterly', { ...cdi, coverage: 'UNAVAILABLE', reason: 'PROVIDER_UNAVAILABLE_OR_INCOMPLETE' }).rows.every((row) => row.CDI === null)).toBe(true);
    expect(performanceRows([], [], 'quarterly').rows).toEqual([]);
  });

  it('shows independent errors and empty states with functional navigation links and toggles', async () => {
    mount({ '/market/indicators': null, '/portfolio/allocation': { byClass: [], bySector: [] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('indicadores de mercado'));
    expect(await screen.findByText(/Sem posições para distribuir/)).toBeTruthy();
  });

  it('renders sector tab, quick action, agenda and journal links', async () => {
    mount({ '/dividends/agenda': { items: [{ id: 'one', exDate: '2099-01-01', symbol: 'PETR4', status: 'expected', rateCentsPerUnit: '125', currency: 'BRL' }], projections: [] } });
    expect(await screen.findByText(/PETR4/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Importar nota' }).getAttribute('href')).toBe('/transactions/import/nota');
    expect(within(screen.getByRole('region', { name: 'Próximos proventos' })).getByRole('link', { name: 'Ver detalhes →' }).getAttribute('href')).toBe('/dividends');
    const sector = await screen.findByRole('tab', { name: 'Setor' });
    fireEvent.click(sector);
    expect(sector.getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('region', { name: 'Alocação' })).getByRole('link', { name: 'Ver detalhes →' }).getAttribute('href')).toBe('/holdings');
    await waitFor(() => expect(screen.getByText(/Nenhuma operação/)).toBeTruthy());
  });

  it('shows four KPI skeleton cards immediately while portfolio lookup is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>);
    const kpis = screen.getByRole('region', { name: 'Indicadores da carteira' });
    expect(kpis.querySelectorAll('[aria-busy="true"]')).toHaveLength(4);
  });

  it('does not fabricate deltas when BRL valuation lacks FX and distinguishes a zero percent base', async () => {
    mount({ '/portfolio/summary': { totalMarketValueCents: '12000', totalCostBasisCents: '25000', unrealizedPnlCents: '0', unpricedCostBasisCents: '13000', holdingsCount: 2, currency: 'BRL', comparison: { kind: 'observed_value_including_cash_flows', currency: 'BRL', timezone: 'America/Sao_Paulo', currentAt: '2026-10-24T12:00:00Z', previousAt: null, previousDate: null, period: null, reason: 'MISSING_FX', hasStaleQuotes: false, total: null, cost: null, unrealized: null, dayMainChange: null } } });
    const kpis = await screen.findByRole('region', { name: 'Indicadores da carteira' });
    await waitFor(() => expect(kpis.querySelectorAll('span[role="status"]')).toHaveLength(4));
    expect([...kpis.querySelectorAll('span[role="status"]')].every((chip) => chip.textContent === 'Câmbio indisponível')).toBe(true);
    expect(within(kpis).getByText('Indisponível')).toBeTruthy();
    expect(within(kpis).queryByText('R$ 0,00', { selector: 'span[role="status"]' })).toBeNull();
  });

  it('apportions class and sector legends to exactly 100,00% using cents, stable remainder ties and grouped Outros', async () => {
    const equal = ['acao', 'fii', 'etf'].map((key) => ({ key, valueCents: '1', percent: 33.33 }));
    expect(allocationPercentages(equal)).toEqual([
      { key: 'acao', percent: 33.34 }, { key: 'fii', percent: 33.33 }, { key: 'etf', percent: 33.33 },
    ]);
    expect(allocationPercentages([...equal].reverse()).find((slice) => slice.key === 'acao')?.percent).toBe(33.34);
    expect(allocationPercentages([{ key: 'vazio', valueCents: '0', percent: 0 }])).toEqual([{ key: 'vazio', percent: 0 }]);
    const sectors = ['Zulu', 'Alfa', 'Meio'].map((key) => ({ key, valueCents: '1', percent: 33.33 }));
    mount({ '/portfolio/allocation': { byClass: equal, bySector: sectors } });
    const widget = await screen.findByRole('region', { name: 'Alocação' });
    await waitFor(() => expect(within(widget).getByText('Ações 33,34%')).toBeTruthy());
    expect(within(widget).getByText('FIIs 33,33%')).toBeTruthy();
    expect(within(widget).getByText('ETFs 33,33%')).toBeTruthy();
    fireEvent.click(within(widget).getByRole('tab', { name: 'Setor' }));
    expect(within(widget).getByText('Alfa 33,34%')).toBeTruthy();
    expect(within(widget).getByText('Zulu 33,33%')).toBeTruthy();
    expect(within(widget).getByText('Meio 33,33%')).toBeTruthy();
    const small = [{ key: 'acao', valueCents: '9401', percent: 94.01 }, { key: 'fii', valueCents: '299', percent: 2.99 }, { key: 'etf', valueCents: '299', percent: 2.99 }, { key: 'Outros', valueCents: '1', percent: 0.01 }];
    const grouped = groupSlices(small);
    expect(grouped).toHaveLength(2);
    expect(grouped.find((slice) => slice.key === 'Outros')?.valueCents).toBe('599');
    expect(allocationPercentages(grouped).reduce((sum, slice) => sum + Math.round(slice.percent * 100), 0)).toBe(10000);
    cleanup();
    mount({ '/portfolio/allocation': { byClass: small, bySector: small } });
    const groupedWidget = await screen.findByRole('region', { name: 'Alocação' });
    await waitFor(() => expect(within(groupedWidget).getByText('Outros 5,99%')).toBeTruthy());
    expect(within(groupedWidget).getByText('Ações 94,01%')).toBeTruthy();
    fireEvent.click(within(groupedWidget).getByRole('tab', { name: 'Setor' }));
    expect(within(groupedWidget).getByText('Outros 5,99%')).toBeTruthy();
  });
});
