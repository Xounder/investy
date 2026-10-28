import { describe, expect, it } from 'vitest';
import { performanceReport } from '../src/services/reports-performance.js';
import { IncomeAccumulator, incomeReport } from '../src/services/reports-income.js';
import type { BenchmarkRow, DividendRow, SnapshotRow, TransactionRow } from '../src/repositories/reports.js';
import type { CdiIndexResult } from '../src/services/market-data/cdi-index.js';

const at = (day: string) => new Date(`${day}T00:00:00Z`);
const snapshot = (day: string, value: bigint) => ({ id: day, date: at(day), totalValueCents: value }) as SnapshotRow;
const index = (symbol: string, day: string, value: bigint) => ({ id: `yahoo-index:${symbol}:${day}`, symbol, date: at(day), value }) as BenchmarkRow;
const cdi: CdiIndexResult = { symbol: 'CDI', source: 'BCB_SGS_12', rateUnit: 'percent_per_business_day',
  indexUnit: 'base_100', range: '3m', requestedStartDate: '2026-01-01', requestedEndDate: '2026-04-30',
  baseDate: '2026-02-01', lastObservationDate: '2026-03-31', coverage: 'COMPLETE_THROUGH_LAST_OBSERVATION',
  baseConvention: 'first_observation_close_excludes_first_rate', reason: null, fetchedAt: '2026-04-01',
  indexSeries: [{ date: '2026-02-01', value: 100 }, { date: '2026-03-31', value: 102 }] };

describe('canonical report calculations', () => {
  it('indexes observed values only, uses a real common base, and discloses missing closes and short CDI history', () => {
    const snapshots = [snapshot('2026-01-31', 10001n), snapshot('2026-02-01', 20001n),
      snapshot('2026-03-31', 30001n), snapshot('2026-04-01', 40001n)];
    const benchmark = [index('IBOV', '2026-02-01', 1000000n), index('IFIX', '2026-02-01', 2000000n),
      index('SPX', '2026-02-01', 3000000n), index('IBOV', '2026-03-31', 1100000n),
      index('IBOV', '2026-04-01', 1200000n), index('IFIX', '2026-03-31', 2200000n),
      { ...index('SPX', '2026-03-31', 3200000n), id: 'legacy-unknown-unit' }];
    const result = performanceReport('p', 'quarter', snapshots, benchmark, cdi);
    expect(result.baseDate).toBe('2026-02-01');
    expect(result.baseObservation).toMatchObject({ date: '2026-02-01', portfolioIndex: 100 });
    expect(result.convention).toBe('OBSERVED_VALUE_INDEX');
    expect(result.periods.map(row => [row.period, row.date])).toEqual([
      ['2026-T1', '2026-03-31'], ['2026-T2', '2026-04-01']]);
    expect(result.periods[0]?.portfolioValueCents).toBe('30001');
    expect(result.periods[0]?.benchmarks.CDI).toBe(102);
    expect(result.periods[0]?.benchmarks.SPX).toBeNull();
    expect(result.periods[1]?.benchmarks.CDI).toBeNull();
    expect(result.benchmarkCoverage.CDI).toMatchObject({ available: true, lastComparableDate: '2026-03-31',
      missingLast: true, partialWindow: true });
    expect(result.benchmarkCoverage.IBOV).toMatchObject({ lastComparableDate: '2026-04-01' });
    const unavailable = performanceReport('p', 'month', [snapshot('2026-01-31', 100n)], [],
      { ...cdi, coverage: 'UNAVAILABLE', indexSeries: [] });
    expect(unavailable.periods[0]?.benchmarks.CDI).toBeNull();
    expect(unavailable.benchmarkCoverage.CDI).toMatchObject({ unavailable: true, missingBase: true });
    expect(performanceReport('p', 'month', [], [], cdi)).toMatchObject({ baseDate: null, periods: [],
      commonBasePartialWindow: false });
  });

  it('reports benchmark coverage for displayed bucket samples, never a hidden intra-month overlap', () => {
    const report = performanceReport('p', 'month', [snapshot('2026-01-01', 100n),
      snapshot('2026-01-15', 110n), snapshot('2026-01-31', 120n)],
    [index('IBOV', '2026-01-01', 1000000n), index('IBOV', '2026-01-15', 1100000n)],
    { ...cdi, coverage: 'UNAVAILABLE', indexSeries: [] });
    expect(report.baseObservation).toMatchObject({ date: '2026-01-01', benchmarks: { IBOV: 100 } });
    expect(report.periods.map(row => [row.date, row.benchmarks.IBOV])).toEqual([['2026-01-31', null]]);
    expect(report.benchmarkCoverage.IBOV).toMatchObject({ lastComparableDate: '2026-01-01',
      comparableObservations: 1, portfolioObservations: 2, missingObservationDates: ['2026-01-31'],
      missingLast: true, stale: true, partialWindow: true });
  });

  it('counts linked paid BRL and historical USD cash exactly once, excludes amortization and flags untrusted rows', () => {
    const paid = [
      { id: 'a', kind: 'dividend', assetId: 'asset', paymentDate: at('2026-01-31') },
      { id: 'b', kind: 'jcp', assetId: 'asset', paymentDate: at('2026-02-01') },
      { id: 'c', kind: 'amortizacao', assetId: 'asset', paymentDate: at('2026-02-01') },
      { id: 'legacy', kind: 'dividend', assetId: 'asset', paymentDate: at('2026-02-01') },
      { id: 'bad-fx', kind: 'dividend', assetId: 'asset', paymentDate: at('2026-02-01') },
    ] as DividendRow[];
    const receipt = (id: string, type: string, qty: bigint, unitPriceCents: bigint, currency = 'BRL', fxRateToBRL: bigint | null = null) =>
      ({ id, dividendId: id, assetId: 'asset', type, qty, unitPriceCents, currency, fxRateToBRL }) as TransactionRow;
    const result = incomeReport('p', '2026-01-31', '2026-02-28', { paid, receipts: [
      receipt('a', 'dividend', 1n, 1n), receipt('b', 'jcp', 3n, 1n, 'USD', 1_500_000n),
      receipt('c', 'amortizacao', 1n, 99n), receipt('bad-fx', 'dividend', 1n, 200n, 'USD')],
    sales: [{ id: 'sale', assetId: 'asset', date: at('2026-02-28'), realizedPnlCents: -3n }] as TransactionRow[],
    catalog: [{ id: 'asset', symbol: 'A', class: 'fii' }] });
    expect(result.totals).toEqual({ incomeCents: '6', amortizationCents: '99', realizedSalePnlCents: '-3' });
    expect(result.periods).toEqual([
      { period: '2026-01', incomeCents: '1', amortizationCents: '0', realizedSalePnlCents: '0' },
      { period: '2026-02', incomeCents: '5', amortizationCents: '99', realizedSalePnlCents: '-3' }]);
    expect(result.byAsset[0]).toMatchObject(result.totals);
    expect(result.byClass[0]).toMatchObject(result.totals);
    expect(result.excludedReceipts).toEqual([
      { dividendId: 'legacy', reason: 'MISSING_OR_INVALID_LINKED_RECEIPT' },
      { dividendId: 'bad-fx', reason: 'HISTORICAL_FX_OR_CURRENCY_UNAVAILABLE' }]);
    expect(result.totalsIncomplete).toBe(true);
  });

  it('paginates asset and reconciliation details but retains all amounts and counts in totals', () => {
    const report = new IncomeAccumulator('p', '2026-01-01', '2026-12-31', 2, 2);
    for (let i = 0; i < 101; i++) {
      const id = `asset-${String(i).padStart(3, '0')}`;
      report.beginPaid([{ id: `div-${i}`, kind: 'dividend', assetId: id,
        paymentDate: at('2026-01-01') }] as DividendRow[], [{ id, symbol: id, class: 'fii' }]);
      report.finishPaid();
      report.addSales([{ id: `sale-${i}`, assetId: id, date: at('2026-12-31'),
        realizedPnlCents: 1n }] as TransactionRow[], [{ id, symbol: id, class: 'fii' }]);
    }
    const result = report.result();
    expect(result.totals).toMatchObject({ realizedSalePnlCents: '101', incomeCents: '0' });
    expect(result.byClass).toEqual([{ assetClass: 'fii', incomeCents: '0',
      amortizationCents: '0', realizedSalePnlCents: '101' }]);
    expect(result).toMatchObject({ byAssetCount: 101, assetPage: 2, assetHasMore: false,
      excludedReceiptCount: 101, issuesPage: 2, issuesHasMore: false });
    expect(result.byAsset).toHaveLength(1);
    expect(result.excludedReceipts).toHaveLength(1);
  });
});
