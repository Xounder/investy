/**
 * Market data routes (ADR-003, design-04).
 *
 * GET /api/v1/market/quotes?symbols=PETR4,VALE3
 * GET /api/v1/market/benchmarks?series=CDI,IBOV
 * GET /api/v1/market/indicators
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { getDb } from '../db/client.js';
import { assets, benchmarkSeries } from '../db/schema.js';
import type { QuoteOverrideTable } from '../db/schema.js';
import { inArray, desc } from 'drizzle-orm';
import { getQuotesWithHydration, MAX_BATCH_SYMBOLS } from '../services/market-data/cache.js';
import { getBrlPrice } from '../services/market-data/fx.js';
import { getUserOverridesByAssetIds } from '../services/market-data/overrides.js';
import { optionalUser, getOptionalUserId } from '../middleware/auth.js';
import type { AssetClass } from '@investy/domain';
import { nativeDayChangePercent } from '../services/valuation.js';

const app = new Hono();

// Optional authentication: public endpoints that resolve user overrides when a
// valid session cookie is present, without rejecting anonymous requests.
app.use('*', optionalUser);


// Validation schemas
const quotesQuerySchema = z.object({
  symbols: z.string(),
});

const benchmarksQuerySchema = z.object({
  series: z.string().optional(),
});

const indicatorsQuerySchema = z.object({});


// Helper for query validation
async function validateQuery<T>(c: Context, schema: z.ZodSchema<T>): Promise<T> {
  const query = c.req.query();
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: 'VALIDATION', message: 'Invalid query parameters' } }),
    });
  }
  return parsed.data;
}

// Transform helper
function parseSymbols(symbols: string): string[] {
  return symbols.split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
}

/**
 * GET /api/v1/market/quotes?symbols=PETR4,VALE3
 *
 * Returns batch quotes with lazy hydration.
 * Response: { quotes[], stale[], overrides[], missing[] }
 */
app.get('/quotes', async (c) => {
  const { symbols: symbolsStr } = await validateQuery(c, quotesQuerySchema);
  const symbols = parseSymbols(symbolsStr);

  if (symbols.length === 0) {
    return c.json({ quotes: [], stale: [], overrides: [], missing: [] });
  }

  if (symbols.length > MAX_BATCH_SYMBOLS) {
    return c.json(
      { error: { code: 'VALIDATION', message: `Maximum ${MAX_BATCH_SYMBOLS} symbols per request` } },
      400,
    );
  }

  // Map symbols to asset classes
  const db = getDb();
  const assetsFound = await db
    .select({ symbol: assets.symbol, class: assets.class, id: assets.id })
    .from(assets)
    .where(inArray(assets.symbol, symbols));

  const assetClassMap = new Map<string, AssetClass>();
  const assetIdMap = new Map<string, string>();

  for (const asset of assetsFound) {
    assetClassMap.set(asset.symbol, asset.class);
    assetIdMap.set(asset.symbol, asset.id);
  }

  // For symbols not in catalog, assume 'acao' as default for hydration attempt
  for (const symbol of symbols) {
    if (!assetClassMap.has(symbol)) {
      assetClassMap.set(symbol, 'acao');
    }
  }

  // Get quotes with hydration
  const { quotes: cachedQuotes, stale, missing } = await getQuotesWithHydration(symbols, assetClassMap);

  // Resolve the authenticated user (optional) and fetch every override for
  // this request in a single query keyed by the asset ids already collected
  // above. This avoids a per-symbol getAssetDetail() N+1 while keeping the
  // read scoped to the session user (ADR-006).
  const userId = getOptionalUserId(c);
  const overridesByAssetId = new Map<string, QuoteOverrideTable>();
  if (userId && assetIdMap.size > 0) {
    const overrides = await getUserOverridesByAssetIds(userId, [...assetIdMap.values()]);
    for (const override of overrides) {
      overridesByAssetId.set(override.assetId, override);
    }
  }

  // Build response
  const quotesResponse = [];
  const overridesResponse = [];

  for (const cached of cachedQuotes) {
    const asset = cached.asset;
    const quote = cached.quote;

    // Get BRL price with FX conversion
    const brlPrice = await getBrlPrice(asset, quote.priceCents, quote.currency, cached.isStale || cached.isExpired);

    let priceCentsBRL: bigint;
    let fxRateUsed: number | null = null;
    let fxUnavailable = false;

    if (brlPrice) {
      priceCentsBRL = brlPrice.priceCentsBRL;
      fxRateUsed = brlPrice.fxRateUsed;
      fxUnavailable = brlPrice.fxUnavailable;
    } else {
      priceCentsBRL = 0n;
      fxUnavailable = true;
    }

    const override = overridesByAssetId.get(asset.id) ?? null;

    quotesResponse.push({
      symbol: asset.symbol,
      name: asset.name,
      class: asset.class,
      priceCents: quote.priceCents.toString(),
      dayChangePercent: override ? null : nativeDayChangePercent(quote.priceCents, quote.previousCloseCents),
      currency: quote.currency,
      priceCentsBRL: priceCentsBRL.toString(),
      fxRateUsed,
      fxUnavailable,
      source: quote.source,
      fetchedAt: quote.fetchedAt.toISOString(),
      isStale: cached.isStale || cached.isExpired,
      override: override ? {
        priceCents: override.priceCents.toString(),
        currency: override.currency,
      } : null,
    });
  }

  // Report overrides for all requested catalog symbols (authenticated user only)
  for (const symbol of symbols) {
    const assetId = assetIdMap.get(symbol);
    const override = assetId ? overridesByAssetId.get(assetId) : undefined;
    if (override) {
      overridesResponse.push({
        symbol,
        priceCents: override.priceCents.toString(),
        currency: override.currency,
        createdAt: override.createdAt.toISOString(),
      });
    }
  }

  return c.json({
    quotes: quotesResponse,
    stale,
    overrides: overridesResponse,
    missing,
  });
});

/**
 * GET /api/v1/market/benchmarks?series=CDI,IBOV
 *
 * Returns benchmark time series from benchmarkSeries table.
 */
app.get('/benchmarks', async (c) => {
  const { series: seriesStr } = await validateQuery(c, benchmarksQuerySchema);
  const series = seriesStr ? parseSymbols(seriesStr) : ['CDI', 'IBOV', 'IFIX', 'SELIC', 'IPCA'];

  const db = getDb();
  const results = await db
    .select()
    .from(benchmarkSeries)
    .where(inArray(benchmarkSeries.symbol, series))
    .orderBy(desc(benchmarkSeries.date));

  // Group by symbol
  const bySymbol = new Map<string, typeof results>();
  for (const row of results) {
    const existing = bySymbol.get(row.symbol) ?? [];
    existing.push(row);
    bySymbol.set(row.symbol, existing);
  }

  const response = series.map(symbol => ({
    symbol,
    series: (bySymbol.get(symbol) ?? []).map(row => ({
      date: row.date.toISOString(),
      value: Number(row.value),
    })),
  }));

  return c.json({ benchmarks: response });
});

/**
 * GET /api/v1/market/indicators
 *
 * Returns latest Selic, CDI, IPCA with fetch time.
 */
app.get('/indicators', async (c) => {
  await validateQuery(c, indicatorsQuerySchema);

  const db = getDb();
  const symbols = ['SELIC', 'CDI', 'IPCA', 'IBOV', 'IFIX'];

  const results = await db
    .select()
    .from(benchmarkSeries)
    .where(inArray(benchmarkSeries.symbol, symbols))
    .orderBy(desc(benchmarkSeries.date));

  // Get latest for each
  const latest = new Map<string, typeof results[0]>();
  for (const row of results) {
    if (!latest.has(row.symbol)) {
      latest.set(row.symbol, row);
    }
  }

  const indicators = symbols.map(symbol => {
    const row = latest.get(symbol);
    if (!row) return null;
    return {
      symbol,
      value: Number(row.value),
      date: row.date.toISOString(),
    };
  }).filter(Boolean);

  return c.json({ indicators, fetchedAt: new Date().toISOString() });
});

export default app;
