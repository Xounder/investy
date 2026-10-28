import { asc, gt, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { assets, holdings } from '../../db/schema.js';
import { fetchAndCacheQuote, getCachedQuotes } from '../../services/market-data/cache.js';
import type { AssetTable } from '../../db/schema.js';
import { localTime } from '../scheduler.js';

/** Sequential hydration avoids bursts while existing provider wrappers enforce quotas. */
export async function refreshAssetBatch(
  batch: AssetTable[],
  cached: typeof getCachedQuotes = getCachedQuotes,
  fetchQuote: typeof fetchAndCacheQuote = fetchAndCacheQuote,
  now = new Date(),
  requiredUntil = now,
): Promise<{ updated: number; fresh: number; failed: number }> {
  const result = { updated: 0, fresh: 0, failed: 0 };
  const entries = await cached(batch.map((asset) => asset.id));
  const byId = new Map(entries.map((entry) => [entry.asset.id, entry]));
  for (const asset of batch) {
    if ((byId.get(asset.id)?.quote.validUntil.getTime() ?? 0) > requiredUntil.getTime()) {
      result.fresh++; continue;
    }
    try {
      if (await fetchQuote(asset.symbol, asset.class)) result.updated++;
      else { result.failed++; console.warn(`[Worker] No quote available for ${asset.symbol}`); }
    } catch (error) {
      result.failed++;
      console.warn(`[Worker] Quote failed for ${asset.symbol}:`, error);
    }
  }
  return result;
}

export async function refreshQuotes(): Promise<void> {
  const db = getDb();
  let cursor = '';
  const totals = { updated: 0, fresh: 0, failed: 0 };
  while (true) {
    const batch = await db.select().from(assets)
      .where(gt(assets.id, cursor))
      .orderBy(asc(assets.id)).limit(50);
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    const tracked = await db.select({ id: holdings.assetId }).from(holdings)
      .where(inArray(holdings.assetId, batch.map((asset) => asset.id)))
      .groupBy(holdings.assetId);
    const trackedIds = new Set(tracked.map((row) => row.id));
    const now = new Date();
    const time = localTime(now);
    // At 17:59, a quote cached at 17:45 is still fresh but expires at close.
    const requiredUntil = time.hour === 17 && time.minute === 59
      ? new Date(now.getTime() + (60 - now.getUTCSeconds()) * 1000) : now;
    const result = await refreshAssetBatch(batch.filter((asset) => trackedIds.has(asset.id)),
      getCachedQuotes, fetchAndCacheQuote, now, requiredUntil);
    totals.updated += result.updated; totals.fresh += result.fresh; totals.failed += result.failed;
  }
  console.info('[Worker] Quote refresh:', totals);
}
