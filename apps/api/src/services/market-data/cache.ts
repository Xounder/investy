/**
 * Quote cache with TTL (ADR-003).
 *
 * Stores quotes in Postgres with freshness tracking. Implements stale-but-valid
 * fallback: expired quotes are still served with an `isStale` flag when
 * providers are unreachable.
 */
import { getDb } from '../../db/client.js';
import { quotes, assets } from '../../db/schema.js';
import { eq, gte, inArray } from 'drizzle-orm';
import type { QuoteTable, NewQuote, AssetTable } from '../../db/schema.js';
import type { AssetClass } from '@investy/domain';
import { providerRegistry } from './quote-provider.js';

/** Cache TTL in milliseconds (intraday: 15 minutes). */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/** Maximum symbols accepted in a single batch quote request (route validation + hydration cap). */
export const MAX_BATCH_SYMBOLS = 50;

/** Cache entry with computed freshness state. */
export interface CachedQuote {
  quote: QuoteTable;
  asset: AssetTable;
  isFresh: boolean;
  isStale: boolean;
  isExpired: boolean;
}

/**
 * Gets cached quotes for a list of asset IDs.
 * Returns entries with freshness flags computed.
 */
export async function getCachedQuotes(assetIds: string[]): Promise<CachedQuote[]> {
  if (assetIds.length === 0) {
    return [];
  }

  const db = getDb();
  const now = new Date();

  const results = await db
    .select({
      quote: quotes,
      asset: assets,
    })
    .from(quotes)
    .innerJoin(assets, eq(quotes.assetId, assets.id))
    .where(inArray(quotes.assetId, assetIds));

  return results.map(({ quote, asset }) => ({
    quote,
    asset,
    isFresh: quote.validUntil > now,
    isStale: quote.isStale,
    isExpired: quote.validUntil <= now,
  }));
}

/**
 * Gets a single cached quote by asset ID.
 */
export async function getCachedQuote(assetId: string): Promise<CachedQuote | null> {
  const results = await getCachedQuotes([assetId]);
  return results[0] ?? null;
}

/**
 * Fetches a quote from the provider chain and stores it in cache.
 * Returns the cached quote (fresh) or null if all providers fail.
 */
export async function fetchAndCacheQuote(
  symbol: string,
  assetClass: AssetClass,
): Promise<CachedQuote | null> {
  // Find asset by symbol
  const db = getDb();
  const [asset] = await db
    .select()
    .from(assets)
    .where(eq(assets.symbol, symbol))
    .limit(1);

  if (!asset) {
    return null;
  }

  // Try provider chain
  const quoteResult = await providerRegistry.fetchWithFallback(symbol, assetClass);

  if (!quoteResult) {
    return null;
  }

  // Store in cache
  const now = new Date();
  const validUntil = new Date(now.getTime() + CACHE_TTL_MS);

  const newQuote: NewQuote = {
    id: crypto.randomUUID(),
    assetId: asset.id,
    priceCents: quoteResult.priceCents,
    currency: quoteResult.currency,
    fxRateToBRL: null, // Set separately by FX service
    source: quoteResult.source,
    isStale: false,
    fetchedAt: now,
    validUntil,
  };

  await db.insert(quotes).values(newQuote).onConflictDoNothing();

  return {
    quote: newQuote as QuoteTable,
    asset,
    isFresh: true,
    isStale: false,
    isExpired: false,
  };
}

/**
 * Gets quotes for symbols, hydrating from providers if cache is empty/expired.
 * Returns cached data with stale flags; never throws on provider failures.
 */
export async function getQuotesWithHydration(
  symbols: string[],
  assetClassMap: Map<string, AssetClass>,
): Promise<{
  quotes: CachedQuote[];
  stale: string[];
  missing: string[];
}> {
  const assetSymbols = [...new Set(symbols)].slice(0, MAX_BATCH_SYMBOLS);

  // Find assets for symbols
  const db = getDb();
  const assetsFound = await db
    .select()
    .from(assets)
    .where(inArray(assets.symbol, assetSymbols));

  const assetBySymbol = new Map(assetsFound.map(a => [a.symbol, a]));
  const foundSymbols = Array.from(assetBySymbol.keys());
  const missing = assetSymbols.filter(s => !assetBySymbol.has(s));

  if (foundSymbols.length === 0) {
    return { quotes: [], stale: [], missing };
  }

  // Get cached quotes
  const assetIds = foundSymbols.map(s => assetBySymbol.get(s)!.id);
  const cached = await getCachedQuotes(assetIds);

  const cachedByAssetId = new Map(cached.map(c => [c.quote.assetId, c]));

  // Identify which need hydration (no cache or expired)
  const needsHydration: Array<{ symbol: string; assetClass: AssetClass; assetId: string }> = [];

  for (const symbol of foundSymbols) {
    const asset = assetBySymbol.get(symbol)!;
    const cachedEntry = cachedByAssetId.get(asset.id);

    if (!cachedEntry || cachedEntry.isExpired) {
      const assetClass = assetClassMap.get(symbol) ?? asset.class;
      needsHydration.push({ symbol, assetClass, assetId: asset.id });
    }
  }

  // Hydrate missing/expired quotes (best effort, parallel)
  const hydrationResults = await Promise.allSettled(
    needsHydration.map(({ symbol, assetClass }) =>
      fetchAndCacheQuote(symbol, assetClass)
    )
  );

  // Merge hydration results
  for (const result of hydrationResults) {
    if (result.status === 'fulfilled' && result.value) {
      cachedByAssetId.set(result.value.quote.assetId, result.value);
    }
  }

  // Build final response
  const finalQuotes: CachedQuote[] = [];
  const staleSymbols: string[] = [];

  for (const symbol of foundSymbols) {
    const asset = assetBySymbol.get(symbol)!;
    const entry = cachedByAssetId.get(asset.id);

    if (entry) {
      finalQuotes.push(entry);
      if (entry.isStale || entry.isExpired) {
        staleSymbols.push(symbol);
      }
    }
  }

  return {
    quotes: finalQuotes,
    stale: staleSymbols,
    missing,
  };
}

/**
 * Marks all quotes as stale (used when provider failures are detected).
 */
export async function markAllQuotesStale(): Promise<void> {
  const db = getDb();
  await db
    .update(quotes)
    .set({ isStale: true })
    .where(eq(quotes.isStale, false));
}

/**
 * Gets all quotes that are currently fresh (for debugging/monitoring).
 */
export async function getFreshQuotes(): Promise<CachedQuote[]> {
  const db = getDb();
  const now = new Date();

  const results = await db
    .select({ quote: quotes, asset: assets })
    .from(quotes)
    .innerJoin(assets, eq(quotes.assetId, assets.id))
    .where(gte(quotes.validUntil, now));

  return results.map(({ quote, asset }) => ({
    quote,
    asset,
    isFresh: true,
    isStale: quote.isStale,
    isExpired: false,
  }));
}