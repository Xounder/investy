/**
 * Transaction repository (ownership-scoped).
 */
import { getDb } from '../db/client.js';
import { transactions } from '../db/schema.js';
import { eq, and, asc, desc, gte, lte } from 'drizzle-orm';
import type { TransactionTable } from '../db/schema.js';
import { createScopedRepository } from './base.js';

export const transactionRepository = {
  ...createScopedRepository(transactions, transactions.userId),

  /** Lists transactions for a user with optional filters. */
  async list(
    userId: string,
    filters: Partial<{
      portfolioId: string;
      accountId: string;
      assetId: string;
      type: string;
    }> = {},
  ): Promise<TransactionTable[]> {
    const db = getDb();
    const conditions = [eq(transactions.userId, userId)];
    if (filters.portfolioId) {
      conditions.push(eq(transactions.portfolioId, filters.portfolioId));
    }
    if (filters.accountId) {
      conditions.push(eq(transactions.accountId, filters.accountId));
    }
    if (filters.assetId) {
      conditions.push(eq(transactions.assetId, filters.assetId));
    }
    if (filters.type) {
      conditions.push(eq(transactions.type, filters.type as TransactionTable['type']));
    }
    return db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(transactions.date, transactions.createdAt);
  },

  /** Lists all transactions for a specific account+asset, ordered chronologically. */
  async listForHolding(userId: string, accountId: string, assetId: string): Promise<TransactionTable[]> {
    const db = getDb();
    return db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, accountId),
          eq(transactions.assetId, assetId),
        ),
      )
      .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id));
  },

  /**
   * Paged, filtered listing for GET /transactions (TASK-05).
   * Fetches pageSize+1 rows so the route can compute `hasMore` without a count.
   */
  async listPaged(
    userId: string,
    filters: Partial<{
      portfolioId: string;
      accountId: string;
      assetId: string;
      type: string;
      from: Date;
      to: Date;
    }> = {},
    page = 1,
    pageSize = 50,
  ): Promise<{ items: TransactionTable[]; hasMore: boolean }> {
    const db = getDb();
    const conditions = [eq(transactions.userId, userId)];
    if (filters.portfolioId) {
      conditions.push(eq(transactions.portfolioId, filters.portfolioId));
    }
    if (filters.accountId) {
      conditions.push(eq(transactions.accountId, filters.accountId));
    }
    if (filters.assetId) {
      conditions.push(eq(transactions.assetId, filters.assetId));
    }
    if (filters.type) {
      conditions.push(eq(transactions.type, filters.type as TransactionTable['type']));
    }
    if (filters.from) {
      conditions.push(gte(transactions.date, filters.from));
    }
    if (filters.to) {
      conditions.push(lte(transactions.date, filters.to));
    }
    const rows = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);
    const hasMore = rows.length > pageSize;
    return { items: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
  },

  /** True when the user has any transaction for a portfolio (delete guard). */
  async existsForPortfolio(userId: string, portfolioId: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.portfolioId, portfolioId)))
      .limit(1);
    return rows.length > 0;
  },

  /** True when the user has any transaction for an account (delete guard). */
  async existsForAccount(userId: string, accountId: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.accountId, accountId)))
      .limit(1);
    return rows.length > 0;
  },
};
