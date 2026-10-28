import { afterEach, describe, expect, it, vi } from 'vitest';
import { comparison, comparisonRows, incomeMonths, pnlPeriods, reportsApi } from './reports';
import type { IncomeHistory } from './dividends';

describe('report read models', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('groups signed persisted sale results, excluding unresolved FX', () => {
    const sales = [{ id: '1', date: '2026-01-01', realizedPnlCents: '125' }, { id: '2', date: '2026-02-01', realizedPnlCents: '-300' }, { id: '3', date: '2026-04-01', realizedPnlCents: null }];
    expect(pnlPeriods(sales, 'quarter')).toEqual([{ key: '2026-T1', cents: '-175' }]);
    expect(pnlPeriods(sales, 'month')).toHaveLength(2);
  });
  it('uses only matching paid income with trusted BRL receipts, flags reconciliation', () => {
    const base = { id: '1', portfolioId: 'mine', assetId: 'a', symbol: 'A', assetName: 'A', assetClass: 'fii', kind: 'rendimento' as const, category: 'income' as const, exDate: '2026-01-01', paymentDate: '2026-02-01', rateCentsPerUnit: '1', currency: 'BRL', eligibleQty: '1', nativeAmountCents: '150', amountCurrency: 'BRL', amountCents: '150', amountCentsBRL: '150', status: 'paid' as const, source: 'manual' as const, reconciliationRequired: false };
    const history: IncomeHistory = { year: 2026, month: null, totalCents: '10000', totalsIncomplete: true, months: [{ year: 2026, month: 2, totalCents: '10000', totalsIncomplete: true, items: [base, { ...base, id: 'other', portfolioId: 'other' }, { ...base, id: 'capital', category: 'return_of_capital' }, { ...base, id: 'legacy', amountCentsBRL: null, reconciliationRequired: true }] }] };
    expect(incomeMonths(history, 'mine')).toMatchObject([{ total: '150', partial: true }]);
  });
  it('does not interpret CDI raw rates as indices or fill missing benchmark observations', () => {
    const snapshots = [{ date: '2026-01-02', totalValueCents: '10000', costBasisCents: '10000' }, { date: '2026-02-02', totalValueCents: '12000', costBasisCents: '11000' }];
    const benchmarks = [{ symbol: 'IBOV', series: [{ date: '2026-01-02', value: 50 }, { date: '2026-02-02', value: 55 }] }];
    const cdi = { symbol: 'CDI' as const, source: 'BCB_SGS_12' as const, rateUnit: 'percent_per_business_day' as const, indexUnit: 'base_100' as const, range: '3m' as const, requestedStartDate: '2026-01-01', requestedEndDate: '2026-03-01', baseDate: '2026-01-02', lastObservationDate: '2026-02-02', coverage: 'COMPLETE_THROUGH_LAST_OBSERVATION' as const, reason: null, fetchedAt: null, indexSeries: [{ date: '2026-01-02', value: 100 }, { date: '2026-02-02', value: 101 }] };
    expect(comparisonRows(snapshots, benchmarks, cdi, 'month')).toMatchObject([{ Carteira: 100, CDI: 100, IBOV: 100, IFIX: null }, { Carteira: 120, CDI: 101, IBOV: 110 }]);
    expect(comparisonRows(snapshots, benchmarks, { ...cdi, coverage: 'UNAVAILABLE' }, 'quarter')[0]?.CDI).toBeNull();
  });
  it('rebases all available indices on a genuinely shared later snapshot, and identifies missing base and stopped series', () => {
    const snaps = ['2026-01-02', '2026-01-03', '2026-02-02', '2026-03-02'].map((date, index) => ({ date, totalValueCents: String(10000 + index * 1000), costBasisCents: '10000' }));
    const indexes = [
      { symbol: 'IBOV', series: [{ date: '2026-01-03', value: 50 }, { date: '2026-02-02', value: 55 }] },
      { symbol: 'IFIX', series: [{ date: '2026-01-03', value: 200 }, { date: '2026-02-02', value: null as unknown as number }, { date: '2026-03-02', value: 230 }] },
      { symbol: 'SPX', series: [{ date: '2026-01-02', value: 100 }, { date: '2026-03-02', value: 120 }] },
    ];
    const result = comparison(snaps, indexes, undefined, 'month');
    expect(result.baseDate).toBe('2026-01-03');
    expect(result.rows[0]).toMatchObject({ Carteira: 100, IBOV: 100, IFIX: 100, SPX: null, CDI: null });
    expect(result.rows.at(-1)).toMatchObject({ IBOV: null, IFIX: 115, SPX: null });
    expect(result.rows[1]?.IFIX).toBeNull();
    expect(result.status.SPX).toMatchObject({ available: false, lastComparableDate: null });
    expect(result.status.IBOV).toMatchObject({ available: true, lastComparableDate: '2026-02-02' });
    expect(result.status.IBOV.reason).toContain('sem observação na última data');
    expect(result.status.CDI.reason).toContain('índice acumulado indisponível');
    expect(comparison(snaps, [{ symbol: 'IBOV', series: [{ date: '2026-01-04', value: 100 }] }], undefined, 'month').rows).toEqual([]);
  });
  it('requires a real CDI close at the shared baseline and flags stale coverage even when provider reports complete', () => {
    const snaps = ['2026-01-02', '2026-02-02', '2026-03-02'].map((date) => ({ date, totalValueCents: '10000', costBasisCents: '10000' }));
    const benchmark = [{ symbol: 'IBOV', series: [{ date: '2026-01-02', value: 100 }, { date: '2026-03-02', value: 110 }] }];
    const cdi = { symbol: 'CDI' as const, source: 'BCB_SGS_12' as const, rateUnit: 'percent_per_business_day' as const, indexUnit: 'base_100' as const, range: '3m' as const, requestedStartDate: '2026-01-01', requestedEndDate: '2026-03-03', baseDate: '2026-02-02', lastObservationDate: '2026-02-02', coverage: 'COMPLETE_THROUGH_LAST_OBSERVATION' as const, reason: null, fetchedAt: null, indexSeries: [{ date: '2026-02-02', value: 100 }] };
    const result = comparison(snaps, benchmark, cdi, 'month');
    expect(result.baseDate).toBe('2026-01-02');
    expect(result.status.CDI.available).toBe(false);
    expect(result.rows.every((row) => row.CDI === null)).toBe(true);
    const cdiOnly = comparison(snaps, [], cdi, 'month');
    expect(cdiOnly.baseDate).toBe('2026-02-02');
    expect(cdiOnly.status.CDI.lastComparableDate).toBe('2026-02-02');
    expect(cdiOnly.status.CDI.reason).toContain('sem observação na última data');
    expect(cdiOnly.rows.at(-1)?.CDI).toBeNull();
  });
  it.each(['month', 'quarter'] as const)('retains last actual overlap inside a %s bucket and derives metadata from displayed rows', (granularity) => {
    const snaps = ['2026-01-02', '2026-02-02', '2026-02-28', '2026-03-02'].map((date, i) => ({ date, totalValueCents: String(10000 + i * 1000), costBasisCents: '10000' }));
    const indexes = [
      { symbol: 'IBOV', series: [{ date: '2026-01-02', value: 100 }, { date: '2026-02-02', value: 110 }] },
      { symbol: 'IFIX', series: [{ date: '2026-01-02', value: 100 }, { date: '2026-02-28', value: 115 }] },
    ];
    const result = comparison(snaps, indexes, undefined, granularity);
    expect(result.baseDate).toBe('2026-01-02');
    expect(result.rows.map((row) => row.date)).toEqual(['2026-01-02', '2026-02-02', '2026-02-28', '2026-03-02']);
    expect(result.rows.find((row) => row.date === '2026-02-02')).toMatchObject({ IBOV: 110, IFIX: null });
    expect(result.rows.find((row) => row.date === '2026-02-28')).toMatchObject({ IBOV: null, IFIX: 115 });
    expect(result.status.IBOV.lastComparableDate).toBe('2026-02-02');
    expect(result.status.IFIX.lastComparableDate).toBe('2026-02-28');
    for (const symbol of ['IBOV', 'IFIX'] as const) {
      expect(result.rows.some((row) => row.date === result.status[symbol].lastComparableDate && row[symbol] !== null)).toBe(true);
    }
  });
  it('requests all sale pages rather than treating page one as complete', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requests.push(url);
      const page = new URL(url, 'http://localhost').searchParams.get('page');
      return new Response(JSON.stringify({ items: [{ id: page, date: '2026-01-01', realizedPnlCents: page === '1' ? '125' : '-75' }], hasMore: page === '1' }), { status: 200 });
    }));
    const result = await reportsApi.sales('portfolio');
    expect(result).toMatchObject({ truncated: false, items: [{ realizedPnlCents: '125' }, { realizedPnlCents: '-75' }] });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain('type=sell');
    expect(requests[1]).toContain('page=2');
    expect(pnlPeriods(result.items, 'month')).toEqual([{ key: '2026-01', cents: '50' }]);
  });
});
