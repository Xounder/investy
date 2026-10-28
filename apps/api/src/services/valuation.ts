/**
 * Live BRL valuation for holdings (TASK-05, ADR-003/ADR-004).
 *
 * Resolves the effective price per holding (user override wins over the
 * cached quote, which serves stale-but-valid values as last-known-good)
 * and converts foreign-currency prices to BRL at read time. Holdings with
 * no price at all return `null` valuation fields — never zero.
 */
import { convertToBRL } from '@investy/domain';

import type { HoldingWithAsset } from '../repositories/holdings.js';
import { getCachedQuotes } from './market-data/cache.js';
import { getUserOverridesByAssetIds } from './market-data/overrides.js';
import { getFxRate } from './market-data/fx.js';

/** Effective price and BRL valuation for a single holding. */
export interface HoldingValuation {
  /** Effective unit price in the asset's own currency; null when no quote/override. */
  priceCents: bigint | null;
  /** Native-currency close-to-current percentage points (e.g. -2.5 = -2.5%). Null when missing/override. Not BRL FX-adjusted. */
  dayChangePercent: number | null;
  /** Effective unit price converted to BRL; null when unavailable. */
  priceCentsBRL: bigint | null;
  /** Price currency (asset currency for quotes/overrides). */
  currency: string;
  /** Market value (qty × BRL price); null when unpriced. */
  marketValueCentsBRL: bigint | null;
  /** Unrealized P&L in BRL (market value − cost basis); null when unpriced. */
  unrealizedPnlCentsBRL: bigint | null;
  /** True when the price comes from a stale/expired cache entry. */
  isStale: boolean;
  /** True when the price comes from a user override. */
  isOverride: boolean;
}

/** Valuation map keyed by holding id. */
export type ValuationMap = Map<string, HoldingValuation>;

/**
 * Computes live BRL valuations for a set of holdings in batch
 * (two queries total + at most one FX rate fetch).
 */
export async function computeValuations(
  userId: string,
  holdingsWithAssets: HoldingWithAsset[],
): Promise<ValuationMap> {
  const result: ValuationMap = new Map();
  if (holdingsWithAssets.length === 0) {
    return result;
  }

  const assetIds = [...new Set(holdingsWithAssets.map((h) => h.assetId))];
  const [cachedQuotes, overrides] = await Promise.all([
    getCachedQuotes(assetIds),
    getUserOverridesByAssetIds(userId, assetIds),
  ]);

  const quoteByAssetId = new Map(cachedQuotes.map((c) => [c.quote.assetId, c]));
  const overrideByAssetId = new Map(overrides.map((o) => [o.assetId, o]));

  let fxRate: Awaited<ReturnType<typeof getFxRate>> = null;
  let fxFetched = false;

  for (const holding of holdingsWithAssets) {
    const override = overrideByAssetId.get(holding.assetId);
    const cached = quoteByAssetId.get(holding.assetId);

    let priceCents: bigint | null = null;
    let currency: string;
    let isStale = false;
    let isOverride = false;
    let dayChangePercent: number | null = null;

    if (override) {
      priceCents = override.priceCents;
      currency = override.currency;
      isOverride = true;
    } else if (cached) {
      priceCents = cached.quote.priceCents;
      currency = cached.quote.currency;
      isStale = cached.isStale || cached.isExpired;
    } else {
      // No quote and no override — valuation fields stay null.
      currency = holding.asset.currency;
      result.set(holding.id, {
        priceCents: null,
        dayChangePercent: null,
        priceCentsBRL: null,
        currency,
        marketValueCentsBRL: null,
        unrealizedPnlCentsBRL: null,
        isStale: false,
        isOverride: false,
      });
      continue;
    }

    let priceCentsBRL: bigint | null;
    if (currency === 'BRL') {
      priceCentsBRL = priceCents;
    } else {
      // FX is fetched at most once per request; without FX the BRL value is unknown.
      if (!fxFetched) {
        fxRate = await getFxRate();
        fxFetched = true;
      }
      priceCentsBRL = fxRate ? convertToBRL(priceCents, fxRate) : null;
      if (!fxRate) {
        isStale = true;
      }
    }

    const marketValueCentsBRL = priceCentsBRL === null ? null : holding.qty * priceCentsBRL;
    result.set(holding.id, {
      priceCents,
      dayChangePercent,
      priceCentsBRL,
      currency,
      marketValueCentsBRL,
      unrealizedPnlCentsBRL: marketValueCentsBRL === null ? null : marketValueCentsBRL - holding.costBasisCents,
      isStale,
      isOverride,
    });
  }

  return result;
}

/** Percentage points in native currency only; never use today's FX to value yesterday's close. */
export function nativeDayChangePercent(price: bigint, previous: bigint | null | undefined): number | null {
  if (previous == null || previous <= 0n) return null;
  const percent = (Number(price - previous) / Number(previous)) * 100;
  return Number.isFinite(percent) ? percent : null;
}
