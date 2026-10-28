import type { DailyRateHistoryProvider, DailyRateObservation } from './quote-provider.js';
import { getLimitedBcbSgsProvider } from './rate-limited-providers.js';

export type CdiRange = '1m' | '3m';

export interface CdiIndexResult {
  symbol: 'CDI';
  source: 'BCB_SGS_12';
  rateUnit: 'percent_per_business_day';
  indexUnit: 'base_100';
  range: CdiRange;
  requestedStartDate: string;
  requestedEndDate: string;
  baseDate: string | null;
  lastObservationDate: string | null;
  /** COMPLETE covers all SGS 11 business days through lastObservationDate, not future/unpublished dates. */
  coverage: 'COMPLETE_THROUGH_LAST_OBSERVATION' | 'UNAVAILABLE';
  /** The first observation CLOSE is normalized to 100; its own daily rate is NOT included. */
  baseConvention: 'first_observation_close_excludes_first_rate';
  reason: 'PROVIDER_UNAVAILABLE_OR_INCOMPLETE' | null;
  fetchedAt: string | null;
  indexSeries: { date: string; value: number }[];
}

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { expires: number; result: CdiIndexResult }>();
const inflight = new Map<string, Promise<CdiIndexResult>>();

/** A first observed closing level of 100; each subsequent DAILY rate compounds once. */
export function accumulateDailyCdi(rows: DailyRateObservation[]): { date: string; value: number }[] {
  let value = 100;
  return [...rows].sort((a, b) => a.date.localeCompare(b.date)).map((row, i) => {
    if (i > 0) value *= 1 + row.percentPerDay / 100;
    return { date: row.date, value: Number(value.toFixed(8)) };
  });
}

export function cdiWindow(range: CdiRange, now: Date): { start: string; end: string } {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [year, month, day] = today.split('-').map(Number);
  const start = new Date(Date.UTC(year!, month! - 1 - (range === '1m' ? 1 : 3), 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day!, lastDay));
  return { start: start.toISOString().slice(0, 10), end: today };
}

/** Injectable provider boundary; production uses the shared quota-limited BCB provider. */
export async function loadCdiIndex(
  range: CdiRange,
  now = new Date(),
  provider?: DailyRateHistoryProvider,
): Promise<CdiIndexResult> {
  const { start, end } = cdiWindow(range, now);
  const key = `${range}:${start}:${end}`;
  if (!provider) {
    const hit = cache.get(key);
    if (hit && hit.expires > now.getTime()) return hit.result;
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const load = async (): Promise<CdiIndexResult> => {
    const base: CdiIndexResult = {
      symbol: 'CDI', source: 'BCB_SGS_12', rateUnit: 'percent_per_business_day',
      indexUnit: 'base_100', baseConvention: 'first_observation_close_excludes_first_rate',
      range, requestedStartDate: start, requestedEndDate: end,
      baseDate: null, lastObservationDate: null, coverage: 'UNAVAILABLE',
      reason: 'PROVIDER_UNAVAILABLE_OR_INCOMPLETE', fetchedAt: null, indexSeries: [],
    };
    try {
      const source = provider ?? await getLimitedBcbSgsProvider();
      const rows = await source.fetchDailyRateHistory(start, end);
      if (!rows?.length || rows.some(row => !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        row.date < start || row.date > end || !Number.isFinite(row.percentPerDay) ||
        row.percentPerDay < 0 || row.percentPerDay > 5) ||
        new Set(rows.map(row => row.date)).size !== rows.length) return base;
      const indexSeries = accumulateDailyCdi(rows);
      const first = indexSeries[0]!;
      const last = indexSeries[indexSeries.length - 1]!;
      // Do not present a months-old feed as a current comparable line.
      const ageDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / 86_400_000;
      if (ageDays > 5 || (Date.parse(`${first.date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 > 5) return base;
      return { ...base, baseDate: first.date, lastObservationDate: last.date,
        coverage: 'COMPLETE_THROUGH_LAST_OBSERVATION', reason: null,
        fetchedAt: now.toISOString(), indexSeries };
    } catch {
      return base;
    }
  };
  if (provider) return load();
  const pending = load().then(result => {
    if (result.coverage !== 'UNAVAILABLE') cache.set(key, { expires: now.getTime() + TTL_MS, result });
    return result;
  }).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}
