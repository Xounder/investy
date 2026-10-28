import { api } from './api';
import type { Benchmark, CdiIndex, Snapshot } from './dashboard';
import type { DividendItem, IncomeHistory } from './dividends';

export type Granularity = 'month' | 'quarter';
export interface Sale { id: string; date: string; realizedPnlCents: string | null }

// Compose reports from observed snapshots, journal sales, and reconciled income.
export const reportsApi = {
  snapshots: async (id: string) => (await api.get<{ snapshots: Snapshot[] }>(`/v1/portfolio/snapshots?${new URLSearchParams({ portfolioId: id, range: '3m' })}`)).snapshots,
  sales: async (id: string) => {
    const items: Sale[] = [];
    for (let page = 1; page <= 200; page++) {
      const result = await api.get<{ items: Sale[]; hasMore: boolean }>(`/v1/transactions?${new URLSearchParams({ portfolioId: id, type: 'sell', page: String(page) })}`);
      items.push(...result.items);
      if (!result.hasMore) return { items, truncated: false };
    }
    return { items, truncated: true };
  },
  income: (year: number) => api.get<IncomeHistory>(`/v1/dividends/history?year=${year}`),
};

export function period(date: string, granularity: Granularity) {
  const day = date.slice(0, 10);
  return granularity === 'month' ? day.slice(0, 7) : `${day.slice(0, 4)}-T${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
}

export function pnlPeriods(sales: Sale[], granularity: Granularity) {
  const sums = new Map<string, bigint>();
  for (const sale of sales) {
    if (sale.realizedPnlCents === null) continue;
    const key = period(sale.date, granularity);
    sums.set(key, (sums.get(key) ?? 0n) + BigInt(sale.realizedPnlCents));
  }
  return [...sums].sort(([a], [b]) => b.localeCompare(a)).map(([key, value]) => ({ key, cents: value.toString() }));
}

export function incomeMonths(history: IncomeHistory, id: string) {
  return history.months.map((month) => {
    const byClass = new Map<string, bigint>();
    const items = month.items.filter((item: DividendItem) => item.portfolioId === id && item.category === 'income' && item.status === 'paid');
    for (const item of items) {
      if (item.reconciliationRequired || item.amountCentsBRL === null) continue;
      const key = item.assetClass ?? 'Outros';
      byClass.set(key, (byClass.get(key) ?? 0n) + BigInt(item.amountCentsBRL));
    }
    return { key: `${month.year}-${String(month.month).padStart(2, '0')}`, byClass,
      total: [...byClass.values()].reduce((sum, value) => sum + value, 0n).toString(),
      partial: items.some((item) => item.reconciliationRequired || item.amountCentsBRL === null) };
  }).filter((month) => month.byClass.size > 0 || month.partial);
}

export const comparisonSymbols = ['CDI', 'IBOV', 'IFIX', 'SPX'] as const;
export type ComparisonSymbol = typeof comparisonSymbols[number];
export interface ComparisonStatus { available: boolean; lastComparableDate: string | null; reason: string }

export function comparison(snapshots: Snapshot[], benchmarks: Benchmark[], cdi: CdiIndex | undefined, granularity: Granularity) {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const maps = new Map(benchmarks.filter((b) => ['IBOV', 'IFIX', 'SPX'].includes(b.symbol)).map((b) => [b.symbol, new Map(b.series.map((p) => [p.date.slice(0, 10), p.value]))]));
  const cdiMap = new Map(cdi?.coverage === 'COMPLETE_THROUGH_LAST_OBSERVATION' && cdi.indexUnit === 'base_100' && cdi.rateUnit === 'percent_per_business_day' ? cdi.indexSeries.map((p) => [p.date.slice(0, 10), p.value]) : []);
  const series = (symbol: ComparisonSymbol) => symbol === 'CDI' ? cdiMap : maps.get(symbol);
  const observed = (symbol: ComparisonSymbol, date: string) => {
    if (symbol === 'CDI' && (date < (cdi?.baseDate ?? '') || date > (cdi?.lastObservationDate ?? ''))) return null;
    const value = series(symbol)?.get(date);
    return value != null && Number.isFinite(value) && value > 0 ? value : null;
  };
  // Choose one real portfolio observation shared by the largest number of valid
  // indices. Never use different base dates per line or forward-fill missing closes.
  const first = ordered.filter((snap) => BigInt(snap.totalValueCents) > 0n)
    .map((snap) => ({ snap, count: comparisonSymbols.filter((symbol) => observed(symbol, snap.date.slice(0, 10)) !== null).length }))
    .sort((a, b) => b.count - a.count || a.snap.date.localeCompare(b.snap.date))[0];
  const baseDate = first?.count ? first.snap.date.slice(0, 10) : null;
  const lastSnapshot = ordered.at(-1)?.date.slice(0, 10);
  const points = baseDate ? ordered.filter((snap) => snap.date.slice(0, 10) >= baseDate) : [];
  // Keep each period's last portfolio observation AND each index's last real
  // overlapping close. Different indices can end on different days in a period.
  const chosen = new Map<string, Snapshot>();
  const latest = new Map<string, Snapshot>();
  for (const point of points) {
    const key = period(point.date, granularity);
    latest.set(key, point);
    for (const symbol of comparisonSymbols) {
      if (observed(symbol, baseDate!) !== null && observed(symbol, point.date.slice(0, 10)) !== null) {
        latest.set(`${key}:${symbol}`, point);
      }
    }
  }
  for (const point of latest.values()) chosen.set(point.date, point);
  if (first && baseDate) chosen.set(first.snap.date, first.snap);
  const samples = [...chosen.values()].sort((a, b) => a.date.localeCompare(b.date));
  const base = first && baseDate ? BigInt(first.snap.totalValueCents) : null;
  const rows = samples.map((snap) => {
    const date = snap.date.slice(0, 10);
    const row: Record<string, number | string | null> = { date, Carteira: Number(BigInt(snap.totalValueCents) * 10000n / base!) / 100 };
    for (const symbol of comparisonSymbols) {
      const initial = observed(symbol, baseDate!);
      const value = observed(symbol, date);
      row[symbol] = initial !== null && value !== null ? value * 100 / initial : null;
    }
    return row;
  });
  const status = Object.fromEntries(comparisonSymbols.map((symbol) => {
    if (!baseDate) return [symbol, { available: false, lastComparableDate: null, reason: symbol === 'CDI' && cdi?.coverage !== 'COMPLETE_THROUGH_LAST_OBSERVATION' ? 'índice acumulado indisponível ou cobertura incompleta' : 'sem data-base comum entre patrimônio e índices' }];
    if (observed(symbol, baseDate) === null) return [symbol, { available: false, lastComparableDate: null, reason: symbol === 'CDI' && cdi?.coverage !== 'COMPLETE_THROUGH_LAST_OBSERVATION' ? 'índice acumulado indisponível ou cobertura incompleta' : 'sem fechamento válido na data-base comum' }];
    const last = [...rows].reverse().find((row) => row[symbol] !== null)?.date as string | undefined;
    return [symbol, { available: true, lastComparableDate: last ?? baseDate, reason: last === lastSnapshot ? 'observação na última data da carteira' : `sem observação na última data da carteira (${lastSnapshot}); último fechamento comparável ${last ?? baseDate}` }];
  })) as Record<ComparisonSymbol, ComparisonStatus>;
  return { rows, baseDate, status };
}

export function comparisonRows(snapshots: Snapshot[], benchmarks: Benchmark[], cdi: CdiIndex | undefined, granularity: Granularity) {
  return comparison(snapshots, benchmarks, cdi, granularity).rows;
}
