/**
 * Holdings repository (ownership-scoped, TASK-05).
 *
 * Holdings are materialized from the journal and are never edited directly;
 * this repository only supports scoped reads used by the read-model routes.
 */
import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '../db/client.js';
import { accounts, assets, holdings } from '../db/schema.js';
import type { AssetTable, HoldingTable } from '../db/schema.js';

/** A holding row joined with its asset catalog data. */
export interface HoldingWithAsset extends HoldingTable {
  asset: AssetTable;
}

export const holdingRepository = {
  /** Lists holdings for a user, optionally filtered by portfolio and/or account. */
  async list(
    userId: string,
    filters: Partial<{ portfolioId: string; accountId: string }> = {},
  ): Promise<HoldingWithAsset[]> {
    const db = getDb();
    const conditions = [eq(holdings.userId, userId)];
    if (filters.accountId) {
      conditions.push(eq(holdings.accountId, filters.accountId));
    }
    if (filters.portfolioId) {
      conditions.push(eq(accounts.portfolioId, filters.portfolioId));
    }
    return db
      .select({ holding: holdings, asset: assets })
      .from(holdings)
      .innerJoin(accounts, eq(holdings.accountId, accounts.id))
      .innerJoin(assets, eq(holdings.assetId, assets.id))
      .where(and(...conditions))
      .then((rows) => rows.map(({ holding, asset }) => ({ ...holding, asset })));
  },

  /** Finds a single holding by account+asset scoped to the user. */
  async findByAccountAsset(
    userId: string,
    accountId: string,
    assetId: string,
  ): Promise<HoldingWithAsset | null> {
    const db = getDb();
    const [row] = await db
      .select({ holding: holdings, asset: assets })
      .from(holdings)
      .innerJoin(assets, eq(holdings.assetId, assets.id))
      .where(
        and(
          eq(holdings.userId, userId),
          eq(holdings.accountId, accountId),
          eq(holdings.assetId, assetId),
        ),
      )
      .limit(1);
    return row ? { ...row.holding, asset: row.asset } : null;
  },

  /** True when the user has any materialized holding (portfolio delete guard). */
  async hasAnyForPortfolio(userId: string, portfolioId: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select({ id: holdings.id })
      .from(holdings)
      .innerJoin(accounts, eq(holdings.accountId, accounts.id))
      .where(and(eq(holdings.userId, userId), eq(accounts.portfolioId, portfolioId)))
      .limit(1);
    return rows.length > 0;
  },

  /** Lists holdings for a set of accounts, scoped to the user (aggregate reads). */
  async listByAccounts(userId: string, accountIds: string[]): Promise<HoldingWithAsset[]> {
    if (accountIds.length === 0) {
      return [];
    }
    const db = getDb();
    const rows = await db
      .select({ holding: holdings, asset: assets })
      .from(holdings)
      .innerJoin(assets, eq(holdings.assetId, assets.id))
      .where(
        and(eq(holdings.userId, userId), inArray(holdings.accountId, accountIds)),
      );
    return rows.map(({ holding, asset }) => ({ ...holding, asset }));
  },

  /** Lists every holding of one asset across the user's accounts (position detail). */
  async listByAsset(userId: string, assetId: string): Promise<HoldingWithAsset[]> {
    const db = getDb();
    const rows = await db
      .select({ holding: holdings, asset: assets })
      .from(holdings)
      .innerJoin(assets, eq(holdings.assetId, assets.id))
      .where(and(eq(holdings.userId, userId), eq(holdings.assetId, assetId)));
    return rows.map(({ holding, asset }) => ({ ...holding, asset }));
  },
};
