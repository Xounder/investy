import { asc, gt } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { portfolios } from '../../db/schema.js';
import { syncFiiDividends } from '../../services/dividends/sync.js';

export async function syncDividendAgenda(): Promise<void> {
  const db = getDb();
  let cursor = '';
  while (true) {
    const batch = await db.select({ id: portfolios.id, userId: portfolios.userId }).from(portfolios)
      .where(gt(portfolios.id, cursor)).orderBy(asc(portfolios.id)).limit(25);
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    for (const portfolio of batch) {
      try {
        const result = await syncFiiDividends(portfolio.userId, portfolio.id);
        console.info('[Worker] Dividend sync:', portfolio.id, result);
      } catch (error) {
        console.error(`[Worker] Dividend sync failed for portfolio ${portfolio.id}:`, error);
      }
    }
  }
}
