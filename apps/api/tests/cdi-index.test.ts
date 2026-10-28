import { afterEach, describe, expect, it, vi } from 'vitest';
import { BcbSgsProvider } from '../src/services/market-data/bcb-sgs.js';
import { RateLimitedProvider, getProviderQuotaStatus, resetProviderQuotaStore } from '../src/services/market-data/provider-rate-limit.js';
import { accumulateDailyCdi, cdiWindow, loadCdiIndex } from '../src/services/market-data/cdi-index.js';

afterEach(() => { vi.unstubAllGlobals(); resetProviderQuotaStore(); });

const daily = [
  { data: '01/10/2026', valor: '0.050000' },
  { data: '02/10/2026', valor: '0.100000' },
  { data: '05/10/2026', valor: '0.050000' },
];
const calendar = daily.map(row => ({ ...row, valor: '0.050000' }));

describe('BCB SGS daily CDI accumulation', () => {
  it('compounds daily percentage-point observations, with a real dated base at 100', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('sgs.12') ? daily : calendar), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const provider = new RateLimitedProvider(new BcbSgsProvider(), { max: 2, windowMs: 60000 });
    const rows = await provider.fetchDailyRateHistory('2026-10-01', '2026-10-05');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]![0]).toContain('bcdata.sgs.12/dados?');
    expect(rows).toEqual([
      { date: '2026-10-01', percentPerDay: 0.05 },
      { date: '2026-10-02', percentPerDay: 0.1 },
      { date: '2026-10-05', percentPerDay: 0.05 },
    ]);
    expect(accumulateDailyCdi(rows!)).toEqual([
      { date: '2026-10-01', value: 100 },
      { date: '2026-10-02', value: 100.1 },
      { date: '2026-10-05', value: 100.15005 },
    ]);
    expect(await provider.fetchDailyRateHistory('2026-10-01', '2026-10-05')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(getProviderQuotaStatus('bcb')?.used).toBe(2);
  });

  it('refuses a two-call history fetch when only one quota slot is available', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(daily)));
    vi.stubGlobal('fetch', fetcher);
    const provider = new RateLimitedProvider(new BcbSgsProvider(), { max: 1, windowMs: 60000 });
    expect(await provider.fetchDailyRateHistory('2026-10-01', '2026-10-05')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(getProviderQuotaStatus('bcb')?.used).toBe(0);
  });

  it('accepts SGS 11 publication ahead of SGS 12 but rejects a missing CDI day inside the observed interval', async () => {
    const calendarAhead = [...calendar, { data: '06/10/2026', valor: '0.05' }];
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('sgs.12') ? daily : calendarAhead)));
    vi.stubGlobal('fetch', fetcher);
    const provider = new BcbSgsProvider();
    expect(await provider.fetchDailyRateHistory('2026-10-01', '2026-10-06')).toHaveLength(3);
    fetcher.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('sgs.12') ? [daily[0], daily[2]] : calendarAhead)));
    expect(await provider.fetchDailyRateHistory('2026-10-01', '2026-10-06')).toBeNull();
  });

  it('rejects missing official business day, duplicate date, invalid value, and upstream failures', async () => {
    const run = async (rates: unknown, days: unknown, status = 200) => {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('sgs.12') ? rates : days), { status })));
      return new BcbSgsProvider().fetchDailyRateHistory('2026-10-01', '2026-10-05');
    };
    expect(await run([daily[0], daily[2]], calendar)).toBeNull();
    expect(await run([...daily, daily[0]], calendar)).toBeNull();
    expect(await run([{ ...daily[0], valor: 'oops' }, ...daily.slice(1)], calendar)).toBeNull();
    expect(await run(daily, calendar, 503)).toBeNull();
  });

  it('declares unavailable on incomplete history/provider failure; never shows a partial curve', async () => {
    const now = new Date('2026-10-24T15:00:00Z');
    const result = await loadCdiIndex('1m', now, {
      fetchDailyRateHistory: async () => null,
    });
    expect(result).toMatchObject({ coverage: 'UNAVAILABLE', indexSeries: [], baseDate: null });
    expect(await loadCdiIndex('1m', now, {
      fetchDailyRateHistory: async () => { throw Error('timeout'); },
    })).toMatchObject({ coverage: 'UNAVAILABLE', indexSeries: [] });
    expect(await loadCdiIndex('1m', now, {
      fetchDailyRateHistory: async () => [{ date: '2026-09-24', percentPerDay: 0.05 }],
    })).toMatchObject({ coverage: 'UNAVAILABLE', indexSeries: [] });
    expect(cdiWindow('3m', now)).toEqual({ start: '2026-07-24', end: '2026-10-24' });
  });

  it('caches complete provider-window reads without repeating HTTP within TTL', async () => {
    const rates = [
      { data: '08/09/2026', valor: '0.05' },
      { data: '05/10/2026', valor: '0.10' },
    ];
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes('sgs.12') ? rates : rates.map(r => ({ ...r, valor: '0.05' })),
    ), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const now = new Date('2026-10-05T17:00:00Z');
    const first = await loadCdiIndex('1m', now);
    const second = await loadCdiIndex('1m', now);
    expect(first).toMatchObject({ coverage: 'COMPLETE_THROUGH_LAST_OBSERVATION', baseDate: '2026-09-08', lastObservationDate: '2026-10-05', baseConvention: 'first_observation_close_excludes_first_rate' });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
