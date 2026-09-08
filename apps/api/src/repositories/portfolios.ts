/**
 * Portfolio repository (ownership-scoped).
 */
import { getDb } from '../db/client.js';
import { portfolios } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import type { PortfolioTable, NewPortfolio } from '../db/schema.js';
import { createScopedRepository } from './base.js';

export const portfolioRepository = {
  ...createScopedRepository(portfolios, portfolios.userId),

  /** Finds the default portfolio for a user. */
  async findDefault(userId: string): Promise<PortfolioTable | null> {
    const db = getDb();
    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.userId, userId), eq(portfolios.isDefault, true)))
      .limit(1);
    return portfolio ?? null;
  },

  /** Creates a new portfolio, ensuring only one default per user. */
  async create(data: Omit<NewPortfolio, 'id'> & { id?: string }): Promise<PortfolioTable> {
    const db = getDb();
    const id = data.id ?? crypto.randomUUID();

    // If this is a default portfolio, unset any existing default
    if (data.isDefault) {
      await db
        .update(portfolios)
        .set({ isDefault: false })
        .where(and(eq(portfolios.userId, data.userId), eq(portfolios.isDefault, true)));
    }

    const [portfolio] = await db
      .insert(portfolios)
      .values({ ...data, id } as NewPortfolio)
      .returning();
    if (!portfolio) throw new Error('Failed to create portfolio');
    return portfolio;
  },

  /** Lists portfolios for a user, default first. */
  async list(userId: string): Promise<PortfolioTable[]> {
    const db = getDb();
    return db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, userId))
      .orderBy(desc(portfolios.isDefault), portfolios.createdAt);
  },
};