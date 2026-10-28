/**
 * Portfolio snapshot repository (ownership-scoped, TASK-05).
 *
 * Snapshots are written by the scheduled worker (TASK-10) and retained
 * indefinitely (design-06). This repository supports the read path only.
 */
import { and, eq, gte, inArray, lt, desc } from 'drizzle-orm';

import { getDb } from '../db/client.js';
import { portfolioSnapshots } from '../db/schema.js';
import type { PortfolioSnapshotTable } from '../db/schema.js';

export const snapshotRepository = {
  /** Actual historical BRL rows only; never substitutes a quote for a snapshot. */
  async listPrior(userId: string, portfolioIds: string[], before: Date): Promise<PortfolioSnapshotTable[]> {
    if (portfolioIds.length === 0) return [];
    return getDb().select().from(portfolioSnapshots).where(and(
      eq(portfolioSnapshots.userId, userId),
      inArray(portfolioSnapshots.portfolioId, portfolioIds),
      lt(portfolioSnapshots.date, before),
    )).orderBy(desc(portfolioSnapshots.date));
  },
  /** Lists snapshots for a portfolio since `fromDate`, newest first. */
  async listSince(
    userId: string,
    portfolioId: string,
    fromDate: Date | null,
  ): Promise<PortfolioSnapshotTable[]> {
    const db = getDb();
    const conditions = [
      eq(portfolioSnapshots.userId, userId),
      eq(portfolioSnapshots.portfolioId, portfolioId),
    ];
    if (fromDate) {
      conditions.push(gte(portfolioSnapshots.date, fromDate));
    }
    return db
      .select()
      .from(portfolioSnapshots)
      .where(and(...conditions))
      .orderBy(portfolioSnapshots.date);
  },
};
