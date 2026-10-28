/**
 * Manual quote override logic (ADR-003).
 *
 * Users can override a quote price for an asset they own. Override wins
 * until explicitly cleared (last-write-wins). Stored per user per asset.
 */
import { getDb } from '../../db/client.js';
import { quoteOverrides, assets } from '../../db/schema.js';
import { eq, and, inArray, getTableColumns } from 'drizzle-orm';
import type { QuoteOverrideTable, NewQuoteOverride } from '../../db/schema.js';

/**
 * Gets a user's override for an asset, if any.
 */
export async function getUserOverride(
  userId: string,
  assetId: string,
): Promise<QuoteOverrideTable | null> {
  const db = getDb();

  const [override] = await db
    .select()
    .from(quoteOverrides)
    .where(and(
      eq(quoteOverrides.userId, userId),
      eq(quoteOverrides.assetId, assetId),
    ))
    .limit(1);

  return override ?? null;
}

/**
 * Creates or updates a user's price override for an asset.
 * Last-write-wins (upsert).
 * Returns the override row.
 * Throws if asset not in catalog.
 */
export async function setUserOverride(
  userId: string,
  assetId: string,
  priceCents: bigint,
  currency: string = 'BRL',
): Promise<QuoteOverrideTable> {
  const db = getDb();

  // Verify asset exists in catalog
  const [asset] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);

  if (!asset) {
    throw new Error('ASSET_NOT_FOUND');
  }

  const now = new Date();
  const overrideData: NewQuoteOverride = {
    id: crypto.randomUUID(),
    userId,
    assetId,
    priceCents,
    currency,
    createdAt: now,
  };

  // Upsert: insert or update on conflict
  const [override] = await db
    .insert(quoteOverrides)
    .values(overrideData)
    .onConflictDoUpdate({
      target: [quoteOverrides.userId, quoteOverrides.assetId],
      set: {
        priceCents: overrideData.priceCents,
        currency: overrideData.currency,
        createdAt: now,
      },
    })
    .returning();

  if (!override) {
    throw new Error('Failed to create/update override');
  }

  return override;
}

/**
 * Clears a user's price override for an asset.
 * Returns true if override was deleted, false if none existed.
 */
export async function clearUserOverride(
  userId: string,
  assetId: string,
): Promise<boolean> {
  const db = getDb();

  const result = await db
    .delete(quoteOverrides)
    .where(and(
      eq(quoteOverrides.userId, userId),
      eq(quoteOverrides.assetId, assetId),
    ));

  return (result.rowCount ?? 0) > 0;
}

/**
 * Gets all overrides for a user.
 */
export async function getUserOverrides(userId: string): Promise<QuoteOverrideTable[]> {
  const db = getDb();

  return db
    .select()
    .from(quoteOverrides)
    .where(eq(quoteOverrides.userId, userId));
}

/** Settings view: one owner-filtered join, including assets absent from catalog pages. */
export async function getUserOverridesWithAssets(userId: string) {
  return getDb()
    .select({ ...getTableColumns(quoteOverrides), symbol: assets.symbol, assetName: assets.name })
    .from(quoteOverrides)
    .innerJoin(assets, eq(quoteOverrides.assetId, assets.id))
    .where(eq(quoteOverrides.userId, userId));
}

/**
 * Gets a user's overrides for a set of assets in a single query (ADR-006).
 *
 * Resolves batched override lookups without a per-asset N+1 read. The predicate
 * is scoped to both the authenticated user and the requested asset ids so a row
 * owned by another user can never leak into the result.
 */
export async function getUserOverridesByAssetIds(
  userId: string,
  assetIds: string[],
): Promise<QuoteOverrideTable[]> {
  if (assetIds.length === 0) {
    return [];
  }

  const db = getDb();

  return db
    .select()
    .from(quoteOverrides)
    .where(and(
      eq(quoteOverrides.userId, userId),
      inArray(quoteOverrides.assetId, assetIds),
    ));
}

/**
 * Resolves the effective quote for a user, considering overrides.
 * Priority: user override > cached quote > null.
 */
export async function resolveEffectiveQuote(
  userId: string | null,
  assetId: string,
  cachedQuote: { priceCents: bigint; currency: string; isStale: boolean } | null,
): Promise<{
  priceCents: bigint;
  currency: string;
  source: 'override' | 'cache' | null;
  isStale: boolean;
  isOverride: boolean;
} | null> {
  // Check user override first
  if (userId) {
    const override = await getUserOverride(userId, assetId);
    if (override) {
      return {
        priceCents: override.priceCents,
        currency: override.currency,
        source: 'override',
        isStale: false, // Overrides are never stale
        isOverride: true,
      };
    }
  }

  // Fall back to cached quote
  if (cachedQuote) {
    return {
      priceCents: cachedQuote.priceCents,
      currency: cachedQuote.currency,
      source: 'cache',
      isStale: cachedQuote.isStale,
      isOverride: false,
    };
  }

  return null;
}
