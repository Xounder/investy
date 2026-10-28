import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { assets, benchmarkSeries, dividends, portfolioSnapshots, portfolios, transactions } from '../db/schema.js';
import { IncomeAccumulator } from '../services/reports-income.js';

const PAGE = 500;
// 3 calendar years is at most 1097 daily observations per symbol; refuse
// unexpectedly dense imports rather than silently returning a truncated history.
const MAX_WINDOW_ROWS = 5000;
export class ReportWindowError extends Error {}
export type SnapshotRow = typeof portfolioSnapshots.$inferSelect;
export type BenchmarkRow = typeof benchmarkSeries.$inferSelect;
export type DividendRow = typeof dividends.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type AssetRow = Pick<typeof assets.$inferSelect, 'id' | 'symbol' | 'class'>;

/** A fixed, disclosed three-year UTC window. Every query and page has a date bound. */
export async function readPerformance(userId: string, portfolioId: string, start: Date, endExclusive: Date) {
  return getDb().transaction(async (tx) => {
    const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios)
      .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId))).limit(1);
    if (!portfolio) return null;
    const [older] = await tx.select({ id: portfolioSnapshots.id }).from(portfolioSnapshots).where(and(
      eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.portfolioId, portfolioId),
      lt(portfolioSnapshots.date, start))).limit(1);
    const snapshots: SnapshotRow[] = [];
    const benchmarks: BenchmarkRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await tx.select().from(portfolioSnapshots).where(and(eq(portfolioSnapshots.userId, userId),
        eq(portfolioSnapshots.portfolioId, portfolioId), gte(portfolioSnapshots.date, start),
        lt(portfolioSnapshots.date, endExclusive)))
        .orderBy(asc(portfolioSnapshots.date), asc(portfolioSnapshots.id)).limit(PAGE).offset(offset);
      if (offset + page.length > MAX_WINDOW_ROWS) throw new ReportWindowError('Snapshot window exceeds supported observation density');
      snapshots.push(...page);
      if (page.length < PAGE) break;
    }
    // Persisted CDI is a daily RATE, not an accumulated index. Only tagged
    // Yahoo closes have verified index units; decoding happens in the service.
    for (let offset = 0; ; offset += PAGE) {
      const page = await tx.select().from(benchmarkSeries).where(and(
        inArray(benchmarkSeries.symbol, ['IBOV', 'IFIX', 'SPX']),
        gte(benchmarkSeries.date, start), lt(benchmarkSeries.date, endExclusive)))
        .orderBy(asc(benchmarkSeries.date), asc(benchmarkSeries.symbol), asc(benchmarkSeries.id)).limit(PAGE).offset(offset);
      if (offset + page.length > MAX_WINDOW_ROWS) throw new ReportWindowError('Benchmark window exceeds supported observation density');
      benchmarks.push(...page);
      if (page.length < PAGE) break;
    }
    return { snapshots, benchmarks, historyBeforeWindow: !!older };
  }, { isolationLevel: 'repeatable read' });
}

/** Fold all pages within a repeatable-read boundary; memory retains only output aggregates and one input page. */
export async function readIncome(userId: string, portfolioId: string, start: Date, endExclusive: Date,
  from: string, to: string, assetPage = 1, issuesPage = 1) {
  return getDb().transaction(async (tx) => {
    const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios)
      .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId))).limit(1);
    if (!portfolio) return null;
    const report = new IncomeAccumulator(portfolioId, from, to, assetPage, issuesPage);
    const catalogFor = async (ids: string[]) => ids.length ? tx.select({ id: assets.id, symbol: assets.symbol,
      class: assets.class }).from(assets).where(inArray(assets.id, [...new Set(ids)])) : [];
    for (let offset = 0; ; offset += PAGE) {
      const paid = await tx.select().from(dividends).where(and(eq(dividends.userId, userId),
        eq(dividends.portfolioId, portfolioId), eq(dividends.status, 'paid'),
        gte(dividends.paymentDate, start), lt(dividends.paymentDate, endExclusive)))
        .orderBy(asc(dividends.paymentDate), asc(dividends.id)).limit(PAGE).offset(offset);
      if (!paid.length) break;
      report.beginPaid(paid, await catalogFor(paid.map(row => row.assetId)));
      const ids = paid.map(row => row.id);
      for (let receiptOffset = 0; ; receiptOffset += PAGE) {
        const receipts = await tx.select().from(transactions).where(and(eq(transactions.userId, userId),
          eq(transactions.portfolioId, portfolioId), inArray(transactions.dividendId, ids)))
          .orderBy(asc(transactions.id)).limit(PAGE).offset(receiptOffset);
        report.addReceipts(receipts);
        if (receipts.length < PAGE) break;
      }
      report.finishPaid();
      if (paid.length < PAGE) break;
    }
    for (let offset = 0; ; offset += PAGE) {
      const sales = await tx.select().from(transactions).where(and(eq(transactions.userId, userId),
        eq(transactions.portfolioId, portfolioId), eq(transactions.type, 'sell'),
        gte(transactions.date, start), lt(transactions.date, endExclusive)))
        .orderBy(asc(transactions.date), asc(transactions.id)).limit(PAGE).offset(offset);
      report.addSales(sales, await catalogFor(sales.map(row => row.assetId)));
      if (sales.length < PAGE) break;
    }
    return report.result();
  }, { isolationLevel: 'repeatable read' });
}
