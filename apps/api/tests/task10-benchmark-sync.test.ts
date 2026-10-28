import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { benchmarkSeries } from '../src/db/schema.js';
import { BcbSgsProvider } from '../src/services/market-data/bcb-sgs.js';
import { YahooProvider } from '../src/services/market-data/yahoo.js';
import { RateLimitedProvider, resetProviderQuotaStore } from '../src/services/market-data/provider-rate-limit.js';
import { checkedObservations, syncBenchmarks } from '../src/worker/jobs/benchmark-sync.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));

type Row = { id: string; symbol: string; date: Date; value: bigint };
class BenchmarkDb {
  readonly rows: Row[] = [];
  readonly writes: Row[] = [];
  insert(table: unknown) {
    expect(table).toBe(benchmarkSeries);
    return { values: (row: Row) => ({ onConflictDoUpdate: async () => {
      this.writes.push({ ...row });
      const index = this.rows.findIndex((stored) => stored.symbol === row.symbol &&
        stored.date.getTime() === row.date.getTime());
      if (index === -1) this.rows.push({ ...row });
      else this.rows[index] = { ...row };
    } }) };
  }
  select() {
    let predicate: unknown;
    const query = {
      from(table: unknown) { expect(table).toBe(benchmarkSeries); return query; },
      where(where: unknown) { predicate = where; return query; },
      orderBy() { return query; },
      then: (resolve: (rows: Row[]) => unknown) => {
        const symbols = whereFacts(predicate).values;
        return Promise.resolve(resolve(this.rows.filter((r) => symbols.includes(r.symbol))
          .sort((a, b) => b.date.getTime() - a.date.getTime())));
      },
    };
    return query;
  }
}

function fixtureFetch(failIfix = false) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('bcdata.sgs.12/')) return Response.json([
      { data: '01/06/2026', valor: '0.055000' }, { data: '02/06/2026', valor: '0.054321' },
    ]);
    if (url.includes('bcdata.sgs.11/')) return Response.json([
      { data: '01/06/2026', valor: '0.06' }, { data: '02/06/2026', valor: '0.06' },
    ]);
    const symbol = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    if (failIfix && symbol === '^IFIX') return new Response(null, { status: 503 });
    const points: Record<string, number> = { '^BVSP': 125000.125, '^IFIX': 3355.4321, '^GSPC': 5312.1253 };
    if (!(symbol in points)) return new Response(null, { status: 404 });
    const dates = symbol === '^GSPC' ? [Date.UTC(2026, 5, 4, 20) / 1000] :
      [Date.UTC(2026, 5, 1, 20) / 1000];
    return Response.json({ chart: { result: [{ meta: { symbol,
      exchangeTimezoneName: symbol === '^GSPC' ? 'America/New_York' : 'America/Sao_Paulo' },
      timestamp: dates, indicators: { quote: [{ close: [points[symbol]] }] } }], error: null } });
  });
}

const providers = () => ({ cdi: new RateLimitedProvider(new BcbSgsProvider(), { max: 4, windowMs: 60_000 }),
  index: new RateLimitedProvider(new YahooProvider(), { max: 3, windowMs: 60_000 }) });
afterEach(() => { vi.unstubAllGlobals(); resetProviderQuotaStore(); });

describe('dated benchmark history sync', () => {
  it('uses real provider HTTP parsing, quotas and DB upserts; endpoint returns raw CDI rates and index points', async () => {
    const db = new BenchmarkDb(); holder.db = db;
    const fetch = fixtureFetch(); vi.stubGlobal('fetch', fetch);
    const result = await syncBenchmarks(new Date('2026-06-05T22:00:00Z'), providers());
    expect(result).toEqual({ saved: { CDI: 2, IBOV: 1, IFIX: 1, SPX: 1 }, failed: [] });
    expect(fetch).toHaveBeenCalledTimes(5); // SGS12+SGS11, three Yahoo symbols
    expect(db.rows).toHaveLength(5);
    expect(db.rows.find((r) => r.symbol === 'CDI' && r.date.toISOString().startsWith('2026-06-01')))
      .toMatchObject({ value: 55_000n, id: 'sgs12-rate:CDI:2026-06-01' });
    expect(db.rows.find((r) => r.symbol === 'SPX')).toMatchObject({ value: 53_121_253n,
      date: new Date('2026-06-04T00:00:00Z') }); // Brazil's Corpus Christi does not suppress US dates.
    const response = await app.request('/api/v1/market/benchmarks?series=CDI,IBOV,SPX');
    expect(response.status).toBe(200);
    const body = await response.json() as { benchmarks: Array<{ symbol: string;
      series: Array<{ date: string; value: number }> }> };
    expect(body.benchmarks[0]?.series.map((r) => r.value)).toEqual([0.054321, 0.055]);
    expect(body.benchmarks[1]?.series[0]?.value).toBe(125000.125);
    expect(body.benchmarks[2]?.series[0]?.value).toBe(5312.1253);
    resetProviderQuotaStore();
    await syncBenchmarks(new Date('2026-06-05T22:00:00Z'), providers());
    expect(db.rows).toHaveLength(5);
    expect(db.writes).toHaveLength(10); // Upserts, not duplicates.
  });

  it('isolates a failed index and rejects bad dates without inventing an observation', async () => {
    const db = new BenchmarkDb(); holder.db = db;
    vi.stubGlobal('fetch', fixtureFetch(true));
    const result = await syncBenchmarks(new Date('2026-06-05T22:00:00Z'), providers());
    expect(result.failed).toEqual(['IFIX']);
    expect(db.rows.map((r) => r.symbol)).not.toContain('IFIX');
    expect(db.rows.map((r) => r.symbol)).toContain('SPX');
    expect(checkedObservations([{ date: '2026-06-31', value: 125.45 }],
      '2026-06-01', '2026-07-01', 10_000)).toBeNull();
    expect(checkedObservations([{ date: '2026-06-04', value: 125.45 },
      { date: '2026-06-04', value: 125.45 }], '2026-06-01', '2026-07-01', 10_000)).toBeNull();
    expect(checkedObservations([], '2026-06-01', '2026-07-01', 10_000)).toEqual([]);
    expect(db.rows).toHaveLength(4);
  });

  it('charges the two-request BCB history cost and one Yahoo call per symbol before HTTP', async () => {
    const fetch = fixtureFetch(); vi.stubGlobal('fetch', fetch);
    const bcb = new RateLimitedProvider(new BcbSgsProvider(), { max: 1, windowMs: 60_000 });
    expect(await bcb.fetchDailyRateHistory('2026-06-01', '2026-06-05')).toBeNull();
    const yahoo = new RateLimitedProvider(new YahooProvider(), { max: 1, windowMs: 60_000 });
    expect(await yahoo.fetchIndexHistory('^GSPC', '2026-06-01', '2026-06-05')).toHaveLength(1);
    expect(await yahoo.fetchIndexHistory('^BVSP', '2026-06-01', '2026-06-05')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
