import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { portfolioSnapshots, portfolios } from '../../db/schema.js';
import type { HoldingWithAsset } from '../../repositories/holdings.js';
import { computeAllocation, computeSummary } from '../../services/portfolio-summary.js';
import type { ValuationMap } from '../../services/valuation.js';
import { isTradingDay, localTime } from '../scheduler.js';
import { readCloseTotals } from './close-inputs.js';

/** Refuse partial or stale snapshots rather than treating unavailable market data as zero. */
export function snapshotTotals(holdings: HoldingWithAsset[], values: ValuationMap) {
  if (holdings.some((holding) => {
    const valuation = values.get(holding.id);
    return valuation?.marketValueCentsBRL == null || valuation.isStale;
  })) return null;
  const summary = computeSummary(holdings, values);
  const allocation = computeAllocation(holdings, values);
  return {
    totalValueCents: summary.totalMarketValueCents,
    costBasisCents: summary.totalCostBasisCents,
    allocationJsonb: {
      byClass: allocation.byClass.map(({ key, valueCents, percent }) => ({ key, valueCents: valueCents.toString(), percent })),
      bySector: allocation.bySector.map(({ key, valueCents, percent }) => ({ key, valueCents: valueCents.toString(), percent })),
    },
  };
}

/** Internal 18:00 São Paulo portfolio valuation cut-off, NOT a claimed official B3 market close. */
export async function captureClose(now = new Date()): Promise<void> {
  const time = localTime(now);
  if (!isTradingDay(time.date) || time.hour < 18) return;
  const close = new Date(now.getTime() - (time.hour - 18) * 3_600_000 - time.minute * 60_000 -
    now.getUTCSeconds() * 1000 - now.getUTCMilliseconds());
  const db = getDb();
  let cursor = '';
  while (true) {
    const batch = await db.select().from(portfolios)
      .where(gt(portfolios.id, cursor)).orderBy(asc(portfolios.id)).limit(25);
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    for (const portfolio of batch) {
      try {
        if (portfolio.createdAt > close) continue;
        await db.transaction(async (tx) => {
          await tx.execute(sql`set transaction isolation level repeatable read`);
          const [existing] = await tx.select({ id: portfolioSnapshots.id }).from(portfolioSnapshots)
            .where(and(eq(portfolioSnapshots.userId, portfolio.userId),
              eq(portfolioSnapshots.portfolioId, portfolio.id), eq(portfolioSnapshots.date, close))).limit(1);
          if (existing) return;
          const totals = await readCloseTotals(tx, portfolio.userId, portfolio.id, close);
          if (!totals) throw new Error('No complete as-of journal, close quote and recorded FX inputs');
          await tx.insert(portfolioSnapshots).values({ id: crypto.randomUUID(), userId: portfolio.userId,
            portfolioId: portfolio.id, date: close, ...totals }).onConflictDoNothing();
        });
      } catch (error) {
        console.error(`[Worker] Snapshot failed for portfolio ${portfolio.id}:`, error);
      }
    }
  }
}
