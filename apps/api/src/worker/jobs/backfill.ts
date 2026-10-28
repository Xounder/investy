import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { accounts, assets, portfolioSnapshots, portfolios, quoteOverrides, quotes,
  snapshotBackfillProgress, transactions } from '../../db/schema.js';
import { isTradingDay, localTime } from '../scheduler.js';
import { historicalTotals, type HistoricalQuote, type HistoricalRow } from './backfill-calculate.js';
import { FX_TTL_MS } from '../../services/market-data/fx.js';

export const DAYS_PER_PORTFOLIO = 5;
const dayOfQuote = sql<string>`to_char(${quotes.fetchedAt} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`;

/** Only dates with real recorded quotes are candidates; never synthesize past prices from today's cache. */
export async function candidateCloseDays(after: string, before: string) {
  return getDb().select({ day: dayOfQuote,
    close: sql<Date>`((${dayOfQuote})::date + time '18:00') AT TIME ZONE 'America/Sao_Paulo'` })
    .from(quotes).where(and(sql`${dayOfQuote} > ${after}`, sql`${dayOfQuote} < ${before}`))
    .groupBy(dayOfQuote).orderBy(asc(dayOfQuote)).limit(DAYS_PER_PORTFOLIO);
}

/** A candidate is attempted once; missing information is explicitly skipped, not a zero-valued snapshot. */
export async function backfillPortfolio(userId: string, portfolioId: string, today: string): Promise<{
  attempted: number; created: number; unavailable: number;
}> {
  const db = getDb();
  const [progress] = await db.select().from(snapshotBackfillProgress)
    .where(and(eq(snapshotBackfillProgress.portfolioId, portfolioId), eq(snapshotBackfillProgress.userId, userId))).limit(1);
  const days = await candidateCloseDays(progress?.lastDate ?? '0000-01-01', today);
  const result = { attempted: 0, created: 0, unavailable: 0 };
  for (const { day, close } of days) {
    try {
      let totals: ReturnType<typeof historicalTotals> = null;
      if (isTradingDay(day)) {
        const [existing] = await db.select({ id: portfolioSnapshots.id }).from(portfolioSnapshots)
          .where(and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.portfolioId, portfolioId),
            eq(portfolioSnapshots.date, close))).limit(1);
        if (!existing) {
          const rows: HistoricalRow[] = await db.select({ transaction: transactions, asset: assets })
            .from(transactions).innerJoin(accounts, eq(transactions.accountId, accounts.id))
            .innerJoin(assets, eq(transactions.assetId, assets.id))
            .where(and(eq(transactions.userId, userId), eq(transactions.portfolioId, portfolioId),
              eq(accounts.userId, userId), eq(accounts.portfolioId, portfolioId), lte(transactions.date, close)));
          if (rows.length) {
            const ids = [...new Set(rows.map((row) => row.asset.id))];
            const [priced, overrides, fx] = await Promise.all([
              db.select({ quote: quotes, asset: assets }).from(quotes).innerJoin(assets, eq(quotes.assetId, assets.id))
                .where(and(inArray(quotes.assetId, ids), lte(quotes.fetchedAt, close),
                  gte(quotes.fetchedAt, new Date(close.getTime() - 18 * 3_600_000))))
                .orderBy(desc(quotes.fetchedAt)),
              db.select({ assetId: quoteOverrides.assetId }).from(quoteOverrides)
                .where(and(eq(quoteOverrides.userId, userId), inArray(quoteOverrides.assetId, ids))),
              db.select({ quote: quotes, asset: assets }).from(quotes).innerJoin(assets, eq(quotes.assetId, assets.id))
                .where(and(eq(assets.symbol, 'USDBRL'), lte(quotes.fetchedAt, close),
                  gte(quotes.fetchedAt, new Date(close.getTime() - FX_TTL_MS))))
                .orderBy(desc(quotes.fetchedAt)).limit(1),
            ]);
            totals = historicalTotals(rows, priced as HistoricalQuote[], fx[0] as HistoricalQuote | undefined,
              new Set(overrides.map((row) => row.assetId)), close);
          }
        } else { result.attempted++; await advance(userId, portfolioId, day); continue; }
      }
      await db.transaction(async (tx) => {
        if (totals) {
          const inserted = await tx.insert(portfolioSnapshots).values({ id: crypto.randomUUID(), userId,
            portfolioId, date: close, ...totals }).onConflictDoNothing().returning({ id: portfolioSnapshots.id });
          if (inserted.length) result.created++;
        } else result.unavailable++;
        await tx.insert(snapshotBackfillProgress).values({ userId, portfolioId, lastDate: day })
          .onConflictDoUpdate({ target: snapshotBackfillProgress.portfolioId,
            set: { lastDate: sql`greatest(${snapshotBackfillProgress.lastDate}, ${day})`, updatedAt: new Date() } });
      });
      result.attempted++;
    } catch (error) {
      console.error('[Worker] Backfill candidate failed:', { portfolioId, day, error });
      break; // Retry this date on the next run rather than silently jumping past a DB failure.
    }
  }
  return result;
}

async function advance(userId: string, portfolioId: string, day: string): Promise<void> {
  await getDb().insert(snapshotBackfillProgress).values({ userId, portfolioId, lastDate: day })
    .onConflictDoUpdate({ target: snapshotBackfillProgress.portfolioId,
      set: { lastDate: sql`greatest(${snapshotBackfillProgress.lastDate}, ${day})`, updatedAt: new Date() } });
}

export async function backfillSnapshots(now = new Date()): Promise<void> {
  const db = getDb();
  const today = localTime(now).date;
  let cursor = '';
  while (true) {
    const batch = await db.select({ id: portfolios.id, userId: portfolios.userId }).from(portfolios)
      .where(sql`${portfolios.id} > ${cursor}`).orderBy(asc(portfolios.id)).limit(25);
    if (!batch.length) break;
    cursor = batch[batch.length - 1]!.id;
    for (const portfolio of batch) {
      try {
        console.info('[Worker] Backfill:', portfolio.id, await backfillPortfolio(portfolio.userId, portfolio.id, today));
      } catch (error) { console.error('[Worker] Backfill failed:', portfolio.id, error); }
    }
  }
}
