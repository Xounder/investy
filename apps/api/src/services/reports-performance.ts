import type { CdiIndexResult } from './market-data/cdi-index.js';
import { benchmarkValue } from './market-data/benchmark-units.js';
import type { BenchmarkRow, SnapshotRow } from '../repositories/reports.js';

export type Granularity = 'month' | 'quarter';
const symbols = ['CDI', 'IBOV', 'IFIX', 'SPX'] as const;
type Symbol = typeof symbols[number];
const dateOf = (date: Date) => date.toISOString().slice(0, 10);
export function reportPeriod(date: string, granularity: Granularity): string {
  return granularity === 'month' ? date.slice(0, 7) : `${date.slice(0, 4)}-T${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
}

/** No interpolation: every comparable number requires a real snapshot and an index close on the same calendar date. */
export function performanceReport(portfolioId: string, granularity: Granularity,
  snapshots: SnapshotRow[], benchmarks: BenchmarkRow[], cdi: CdiIndexResult,
  window?: { startDate: string; endDate: string; historyBeforeWindow: boolean }) {
  const ordered = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  const byDay = new Map(ordered.map(row => [dateOf(row.date), row]));
  const points = [...byDay].sort(([a], [b]) => a.localeCompare(b));
  const series = new Map<Symbol, Map<string, number>>(symbols.map(symbol => [symbol, new Map()]));
  for (const row of benchmarks) {
    if (row.symbol !== 'IBOV' && row.symbol !== 'IFIX' && row.symbol !== 'SPX') continue;
    // Legacy untagged observations have unknown units and must not be indexed.
    if (!row.id.startsWith(`yahoo-index:${row.symbol}:`)) continue;
    const value = benchmarkValue(row);
    if (Number.isFinite(value) && value > 0) series.get(row.symbol)!.set(dateOf(row.date), value);
  }
  if (cdi.coverage === 'COMPLETE_THROUGH_LAST_OBSERVATION' && cdi.indexUnit === 'base_100' &&
    cdi.rateUnit === 'percent_per_business_day') {
    for (const row of cdi.indexSeries) {
      if (Number.isFinite(row.value) && row.value > 0 && row.date >= (cdi.baseDate ?? '') &&
        row.date <= (cdi.lastObservationDate ?? '')) series.get('CDI')!.set(row.date, row.value);
    }
  }
  const eligible = points.filter(([, row]) => row.totalValueCents > 0n);
  const base = eligible.map(([date, row]) => ({ date, row,
    matches: symbols.filter(symbol => series.get(symbol)!.has(date)).length }))
    .sort((a, b) => b.matches - a.matches || a.date.localeCompare(b.date))[0];
  const baseDate = base?.date ?? null;
  const lastDate = points.at(-1)?.[0] ?? null;
  const included = base ? points.filter(([date]) => date >= base.date) : [];
  const buckets = new Map<string, [string, SnapshotRow]>();
  for (const point of included) buckets.set(reportPeriod(point[0], granularity), point);
  const sampled = base ? [ [base.date, base.row] as [string, SnapshotRow], ...buckets.values()]
    .filter(([date], i, all) => all.findIndex(([other]) => other === date) === i) : [];
  const status = Object.fromEntries(symbols.map(symbol => {
    const values = series.get(symbol)!;
    const baseValue = baseDate ? values.get(baseDate) : undefined;
    // Coverage describes displayed samples, not unsampled intra-period closes.
    const comparable = baseValue === undefined ? [] : sampled.filter(([date]) => values.has(date)).map(([date]) => date);
    const missingObservationDates = sampled.filter(([date]) => !values.has(date)).map(([date]) => date);
    const lastComparableDate = comparable.at(-1) ?? null;
    const available = baseValue !== undefined;
    const reason = !baseDate ? 'NO_POSITIVE_SNAPSHOT' : !available
      ? symbol === 'CDI' && cdi.coverage !== 'COMPLETE_THROUGH_LAST_OBSERVATION' ? 'CDI_UNAVAILABLE_OR_INCOMPLETE' : 'MISSING_COMMON_BASE'
      : lastComparableDate !== lastDate ? 'MISSING_LAST_COMPARABLE_OBSERVATION' : null;
    return [symbol, { available, source: symbol === 'CDI' ? 'BCB_SGS_12_ACCUMULATED_INDEX' : 'YAHOO_INDEX_CLOSE',
      baseDate: available ? baseDate : null, firstObservationDate: [...values.keys()].sort()[0] ?? null,
      lastObservationDate: [...values.keys()].sort().at(-1) ?? null,
      lastComparableDate, comparableObservations: comparable.length, portfolioObservations: sampled.length,
      missingObservationDates,
      missingBase: !available, missingLast: available && lastComparableDate !== lastDate,
      stale: available && lastComparableDate !== lastDate, unavailable: !available,
      partialWindow: !available || sampled.length !== comparable.length || (baseDate !== points[0]?.[0]) ||
        !!window?.historyBeforeWindow, reason,
      ...(symbol === 'CDI' ? { providerCoverage: cdi.coverage, providerStartDate: cdi.requestedStartDate,
        providerLastObservationDate: cdi.lastObservationDate, fetchedAt: cdi.fetchedAt } : {}) }];
  }));
  const toObservation = ([date, snap]: [string, SnapshotRow]) => ({ date,
    portfolioValueCents: snap.totalValueCents.toString(),
    // Four decimal places of index points, computed without floating-point money arithmetic.
    portfolioIndex: Number(snap.totalValueCents * 1_000_000n / base!.row.totalValueCents) / 10_000,
    benchmarks: Object.fromEntries(symbols.map(symbol => {
      const initial = baseDate ? series.get(symbol)!.get(baseDate) : undefined;
      const value = series.get(symbol)!.get(date);
      return [symbol, initial !== undefined && value !== undefined ? value * 100 / initial : null];
    })) as Record<Symbol, number | null> });
  const rows = [...buckets.values()].map(point => ({ period: reportPeriod(point[0], granularity),
    ...toObservation(point) }));
  return { portfolioId, granularity, currency: 'BRL', indexBase: 100, baseDate,
    convention: 'OBSERVED_VALUE_INDEX', disclosure: 'Flows and FX may affect observed portfolio value; not a cash-flow-adjusted return.',
    source: 'PERSISTED_PORTFOLIO_SNAPSHOTS', firstSnapshotDate: points[0]?.[0] ?? null,
    lastSnapshotDate: lastDate, snapshotObservations: points.length,
    requestedStartDate: window?.startDate ?? null, requestedEndDate: window?.endDate ?? null,
    historyBeforeWindow: window?.historyBeforeWindow ?? false,
    baseObservation: base ? toObservation([base.date, base.row]) : null,
    commonBasePartialWindow: !!window?.historyBeforeWindow || (baseDate !== null && baseDate !== points[0]?.[0]),
    benchmarkCoverage: status, periods: rows };
}
