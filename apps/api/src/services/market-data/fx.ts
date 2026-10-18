/**
 * FX quote row management (USDBRL).
 *
 * Manages the USD→BRL exchange rate cached from brapi (primary) or BCB (fallback).
 * Conversion is applied at READ time: `priceCentsUSD × fxRate` → BRL cents.
 * BDRs are quoted directly in BRL by brapi — no FX step needed.
 *
 * FX rates are stored as scaled integers (micro-units): 1 unit = 0.000001
 * e.g., 5.20 USD/BRL is stored as 5200000n
 */
import { getDb } from '../../db/client.js';
import { quotes, assets } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import type { QuoteTable, NewQuote, AssetTable } from '../../db/schema.js';
import { getLimitedBrapiProvider, getLimitedBcbSgsProvider } from './rate-limited-providers.js';
import { convertToBRL, type FxRate } from '@investy/domain';

/** FX cache TTL (weekly per design-03). */
export const FX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** FX asset symbol. */
export const FX_SYMBOL = 'USDBRL';

/** FX asset class. */
export const FX_ASSET_CLASS = 'indice' as const;

/** Scale factor for FX rates (micro-units: 1 = 0.000001). */
export const FX_SCALE = 1_000_000n;

/**
 * Converts a float rate to scaled bigint (micro-units).
 */
export function toFxScale(rate: number): bigint {
  return BigInt(Math.round(rate * Number(FX_SCALE)));
}

/**
 * Converts scaled bigint (micro-units) to float rate.
 */
export function fromFxScale(scaled: bigint): number {
  return Number(scaled) / Number(FX_SCALE);
}

/**
 * Gets the current FX rate from cache or fetches from providers.
 * Returns FxRate or null if unavailable.
 */
export async function getFxRate(): Promise<FxRate | null> {
  const cached = await getCachedFxRate();

  if (cached && !isFxStale(cached)) {
    return {
      rate: fromFxScale(cached.fxRateToBRL!),
      fetchedAt: cached.fetchedAt,
    };
  }

  // Try to fetch fresh rate
  const freshRate = await fetchAndCacheFxRate();
  if (freshRate) {
    return freshRate;
  }

  // Return stale if available (last-known-good)
  if (cached) {
    return {
      rate: fromFxScale(cached.fxRateToBRL!),
      fetchedAt: cached.fetchedAt,
    };
  }

  return null;
}

/**
 * Gets cached FX quote without fetching.
 */
export async function getCachedFxRate(): Promise<QuoteTable | null> {
  const db = getDb();

  // Find or create FX asset
  const [fxAsset] = await db
    .select()
    .from(assets)
    .where(eq(assets.symbol, FX_SYMBOL))
    .limit(1);

  if (!fxAsset) {
    return null;
  }

  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.assetId, fxAsset.id))
    .orderBy(desc(quotes.fetchedAt))
    .limit(1);

  return quote ?? null;
}

/**
 * Checks if FX quote is stale (expired).
 */
export function isFxStale(quote: QuoteTable): boolean {
  if (!quote.fxRateToBRL) {
    return true;
  }
  const now = new Date();
  return quote.validUntil <= now;
}

/**
 * Fetches FX rate from provider chain (brapi primary, BCB fallback) and caches it.
 */
export async function fetchAndCacheFxRate(): Promise<FxRate | null> {
  const db = getDb();

  // Ensure FX asset exists
  const [fxAsset] = await db
    .select()
    .from(assets)
    .where(eq(assets.symbol, FX_SYMBOL))
    .limit(1);

  let fxAssetFinal: AssetTable;
  if (!fxAsset) {
    const assetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: assetId,
      symbol: FX_SYMBOL,
      name: 'USD/BRL Exchange Rate',
      class: FX_ASSET_CLASS,
      currency: 'BRL',
      providerKey: 'USDBRL',
    });
    fxAssetFinal = { id: assetId, symbol: FX_SYMBOL } as AssetTable;
  } else {
    fxAssetFinal = fxAsset;
  }

  // Try brapi first (primary) — uses rate-limited provider
  let quoteResult = await (await getLimitedBrapiProvider()).fetchQuote('USDBRL', FX_ASSET_CLASS);

  // Fallback to BCB (Selic-based or USD/BRL if available) — uses rate-limited provider
  if (!quoteResult) {
    quoteResult = await (await getLimitedBcbSgsProvider()).fetchQuote('USD', FX_ASSET_CLASS);
  }

  // Fallback: try brapi with different symbol — uses rate-limited provider
  if (!quoteResult) {
    quoteResult = await (await getLimitedBrapiProvider()).fetchQuote('USD', FX_ASSET_CLASS);
  }

  if (!quoteResult) {
    return null;
  }

  // brapi returns USD/BRL rate (e.g., 5.25)
  // Store as micro-units (5.25 = 5250000)
  const rateScaled = toFxScale(Number(quoteResult.priceCents) / 100);

  const now = new Date();
  const validUntil = new Date(now.getTime() + FX_TTL_MS);

  const newQuote: NewQuote = {
    id: crypto.randomUUID(),
    assetId: fxAssetFinal.id,
    priceCents: quoteResult.priceCents, // Raw price in provider currency
    currency: quoteResult.currency,
    fxRateToBRL: rateScaled,
    source: quoteResult.source,
    isStale: false,
    fetchedAt: now,
    validUntil,
  };

  await db.insert(quotes).values(newQuote).onConflictDoNothing();

  return {
    rate: fromFxScale(rateScaled),
    fetchedAt: now,
  };
}

/**
 * Converts a USD price to BRL using the current FX rate.
 * Returns null if FX rate is unavailable.
 * BDRs (quoted in BRL) should skip this conversion.
 */
export async function convertUsdToBrl(priceCentsUsd: bigint): Promise<bigint | null> {
  const fxRate = await getFxRate();
  if (!fxRate) {
    return null;
  }
  return convertToBRL(priceCentsUsd, fxRate);
}

/**
 * Gets the BRL price for an asset, applying FX conversion if needed.
 * - BRL assets: returns priceCents directly
 * - USD assets (etf_us, etf_ie, crypto): converts using FX rate
 * - BDR assets: returns priceCents directly (brapi quotes BDRs in BRL)
 * Returns { priceCentsBRL, currency: 'BRL', fxRateUsed, isStale } or null if unavailable.
 */
export async function getBrlPrice(
  asset: AssetTable,
  priceCents: bigint,
  currency: string,
  isStale: boolean,
): Promise<{
  priceCentsBRL: bigint;
  currency: 'BRL';
  fxRateUsed: number | null;
  isStale: boolean;
  fxUnavailable: boolean;
} | null> {
  // Already in BRL (Brazilian stocks, FIIs, ETFs, BDRs, RF, Tesouro)
  if (currency === 'BRL') {
    return {
      priceCentsBRL: priceCents,
      currency: 'BRL',
      fxRateUsed: null,
      isStale,
      fxUnavailable: false,
    };
  }

  // Foreign currency (USD for US/IE ETFs, crypto) — needs FX conversion
  if (currency === 'USD') {
    const fxRate = await getFxRate();
    if (!fxRate) {
      return {
        priceCentsBRL: 0n,
        currency: 'BRL',
        fxRateUsed: null,
        isStale: true,
        fxUnavailable: true,
      };
    }

    const priceCentsBRL = convertToBRL(priceCents, fxRate);
    return {
      priceCentsBRL,
      currency: 'BRL',
      fxRateUsed: fxRate.rate,
      isStale,
      fxUnavailable: false,
    };
  }

  // Unsupported currency
  return null;
}