import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { accounts, assets, quoteOverrides, quotes, transactions } from '../../db/schema.js';
import { FX_TTL_MS } from '../../services/market-data/fx.js';
import { historicalTotals } from './backfill-calculate.js';

type Reader = Pick<ReturnType<typeof getDb>, 'select'>;

/** Reads precisely the recorded as-of inputs used for the calculation. Never hydrate providers or re-read latest. */
export async function readCloseTotals(db: Reader, userId: string, portfolioId: string, close: Date) {
  const rows = await db.select({ transaction: transactions, asset: assets }).from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(assets, eq(transactions.assetId, assets.id))
    .where(and(eq(transactions.userId, userId), eq(transactions.portfolioId, portfolioId),
      eq(accounts.userId, userId), eq(accounts.portfolioId, portfolioId), lte(transactions.date, close)));
  const ids = [...new Set(rows.map((row) => row.asset.id))];
  if (!ids.length) return historicalTotals([], [], undefined, new Set(), close);
  const [priced, overrides] = await Promise.all([
    db.select({ quote: quotes, asset: assets }).from(quotes).innerJoin(assets, eq(quotes.assetId, assets.id))
      .where(and(inArray(quotes.assetId, ids), lte(quotes.fetchedAt, close),
        gte(quotes.fetchedAt, new Date(close.getTime() - 18 * 3_600_000))))
      .orderBy(desc(quotes.fetchedAt)),
    db.select({ assetId: quoteOverrides.assetId }).from(quoteOverrides)
      .where(and(eq(quoteOverrides.userId, userId), inArray(quoteOverrides.assetId, ids))),
  ]);
  // All active overrides are ambiguous historically, including those created after close.
  const needsFx = rows.some((row) => row.asset.currency !== 'BRL');
  const [fx] = needsFx ? await db.select({ quote: quotes, asset: assets }).from(quotes)
    .innerJoin(assets, eq(quotes.assetId, assets.id))
    .where(and(eq(assets.symbol, 'USDBRL'), lte(quotes.fetchedAt, close),
      gte(quotes.fetchedAt, new Date(close.getTime() - FX_TTL_MS))))
    .orderBy(desc(quotes.fetchedAt)).limit(1) : [];
  return historicalTotals(rows, priced, fx, new Set(overrides.map((row) => row.assetId)), close);
}
