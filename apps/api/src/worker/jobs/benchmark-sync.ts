import { getDb } from '../../db/client.js';
import { benchmarkSeries } from '../../db/schema.js';
import { CDI_SCALE, INDEX_SCALE, scaledObservation } from '../../services/market-data/benchmark-units.js';
import { getLimitedBcbSgsProvider, getLimitedYahooProvider } from '../../services/market-data/rate-limited-providers.js';
import type { DailyRateHistoryProvider, IndexObservation } from '../../services/market-data/quote-provider.js';

export const BENCHMARK_WINDOW_DAYS = 90;
export const MAX_OBSERVATIONS = 100;
const indices = { IBOV: '^BVSP', IFIX: '^IFIX', SPX: '^GSPC' } as const;

export function benchmarkWindow(now: Date): { start: string; end: string } {
  // Inclusive UTC date window; the provider's exchange-local dates determine the actual observations.
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${end}T00:00:00Z`) - BENCHMARK_WINDOW_DAYS * 86_400_000)
    .toISOString().slice(0, 10);
  return { start, end };
}

/** Strictly dated, unadjusted observations only; no weekend/holiday extrapolation. */
export function checkedObservations(rows: Array<{ date: string; value: number }>, start: string, end: string,
  scale: number): Array<{ date: Date; value: bigint }> | null {
  if (rows.length > MAX_OBSERVATIONS) return null;
  const seen = new Set<string>();
  const result: Array<{ date: Date; value: bigint }> = [];
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date < start || row.date > end || seen.has(row.date)) return null;
    const date = new Date(`${row.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== row.date) return null;
    const value = scaledObservation(row.value, scale);
    if (value == null || (scale === INDEX_SCALE && value === 0n)) return null;
    seen.add(row.date);
    result.push({ date, value });
  }
  return result;
}

async function persist(symbol: string, tag: string, rows: Array<{ date: string; value: number }>,
  start: string, end: string, scale: number): Promise<number> {
  const checked = checkedObservations(rows, start, end, scale);
  if (!checked || checked.length === 0) throw new Error('Provider returned no valid dated observations');
  const db = getDb();
  for (const row of checked) {
    const day = row.date.toISOString().slice(0, 10);
    const id = `${tag}:${symbol}:${day}`;
    await db.insert(benchmarkSeries).values({ id, symbol, date: row.date, value: row.value })
      .onConflictDoUpdate({ target: [benchmarkSeries.symbol, benchmarkSeries.date],
        set: { id, value: row.value } });
  }
  return checked.length;
}

/** Injectable provider boundary, production defaults to shared rate-limited wrappers. */
export async function syncBenchmarks(now = new Date(), providers?: {
  cdi: DailyRateHistoryProvider;
  index: { fetchIndexHistory(symbol: string, start: string, end: string): Promise<IndexObservation[] | null> };
}): Promise<{ saved: Record<string, number>; failed: string[] }> {
  const { start, end } = benchmarkWindow(now);
  const sources = providers ?? { cdi: await getLimitedBcbSgsProvider(), index: await getLimitedYahooProvider() };
  const saved: Record<string, number> = {};
  const failed: string[] = [];
  try {
    const rows = await sources.cdi.fetchDailyRateHistory(start, end);
    saved.CDI = await persist('CDI', 'sgs12-rate', rows?.map(({ date, percentPerDay }) =>
      ({ date, value: percentPerDay })) ?? [], start, end, CDI_SCALE);
    console.info('[Worker] Benchmark CDI raw daily rates:', saved.CDI);
  } catch (error) {
    failed.push('CDI');
    console.error('[Worker] Benchmark CDI failed:', error);
  }
  for (const [name, symbol] of Object.entries(indices)) {
    try {
      const rows = await sources.index.fetchIndexHistory(symbol, start, end);
      saved[name] = await persist(name, 'yahoo-index', rows?.map(({ date, points }) =>
        ({ date, value: points })) ?? [], start, end, INDEX_SCALE);
      console.info(`[Worker] Benchmark ${name} raw index closes:`, saved[name]);
    } catch (error) {
      failed.push(name);
      console.error(`[Worker] Benchmark ${name} failed:`, error);
    }
  }
  return { saved, failed };
}

export async function runBenchmarkJob(): Promise<void> {
  const { failed } = await syncBenchmarks();
  if (failed.length) throw new Error(`Benchmark providers unavailable: ${failed.join(', ')}`);
}
