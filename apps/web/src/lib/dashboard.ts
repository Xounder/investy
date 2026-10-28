import { api } from './api';

export interface DashboardSummary {
  totalMarketValueCents: string; totalCostBasisCents: string; unrealizedPnlCents: string;
  unpricedCostBasisCents: string; holdingsCount: number; currency: 'BRL'; comparison: SummaryComparison;
}
export interface SummaryDelta { amountCents: string; percent: number | null }
export interface SummaryComparison {
  kind: 'observed_value_including_cash_flows'; currency: 'BRL'; timezone: 'America/Sao_Paulo';
  currentAt: string; previousAt: string | null; previousDate: string | null;
  period: 'since_snapshot' | null;
  reason: 'NO_SNAPSHOT' | 'INCOMPLETE_COVERAGE' | 'INCOMPLETE_VALUATION' | 'MISSING_FX' | null;
  hasStaleQuotes: boolean;
  total: SummaryDelta | null; cost: SummaryDelta | null;
  unrealized: SummaryDelta | null; dayMainChange: SummaryDelta | null;
}
export interface AllocationSlice { key: string; valueCents: string; percent: number }
export interface Allocation { byClass: AllocationSlice[]; bySector: AllocationSlice[] }
export interface Snapshot { date: string; totalValueCents: string; costBasisCents: string }
export interface Indicator { symbol: string; value: number; date: string }
export interface Benchmark { symbol: string; series: { date: string; value: number }[] }
export interface CdiIndex {
  symbol: 'CDI'; source: 'BCB_SGS_12'; rateUnit: 'percent_per_business_day'; indexUnit: 'base_100';
  range: '1m' | '3m'; requestedStartDate: string; requestedEndDate: string;
  baseDate: string | null; lastObservationDate: string | null;
  coverage: 'COMPLETE_THROUGH_LAST_OBSERVATION' | 'UNAVAILABLE';
  reason: 'PROVIDER_UNAVAILABLE_OR_INCOMPLETE' | null; fetchedAt: string | null;
  indexSeries: { date: string; value: number }[];
}

const root = '/v1';
export const dashboardApi = {
  summary: (id: string) => api.get<DashboardSummary>(`${root}/portfolio/summary?portfolioId=${encodeURIComponent(id)}`),
  allocation: (id: string) => api.get<Allocation>(`${root}/portfolio/allocation?portfolioId=${encodeURIComponent(id)}`),
  snapshots: async (id: string) => (await api.get<{ snapshots: Snapshot[] }>(`${root}/portfolio/snapshots?portfolioId=${encodeURIComponent(id)}&range=1y`)).snapshots,
  indicators: async () => (await api.get<{ indicators: Indicator[]; fetchedAt: string }>(`${root}/market/indicators`)).indicators,
  benchmarks: async () => (await api.get<{ benchmarks: Benchmark[] }>(`${root}/market/benchmarks?series=IBOV,IFIX,SPX`)).benchmarks,
  cdiIndex: async (range: '1m' | '3m') => (await api.get<{ cdiIndex: CdiIndex }>(`${root}/market/benchmarks/cdi-index?range=${range}`)).cdiIndex,
};
