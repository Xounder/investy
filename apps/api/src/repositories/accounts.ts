/**
 * Account repository (ownership-scoped).
 */
import { getDb } from '../db/client.js';
import { accounts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { AccountTable } from '../db/schema.js';
import { createScopedRepository } from './base.js';

export const accountRepository = {
  ...createScopedRepository(accounts, accounts.userId),

  /** Lists accounts for a user, optionally filtered by portfolio. */
  async listByPortfolio(userId: string, portfolioId: string): Promise<AccountTable[]> {
    const db = getDb();
    return db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.portfolioId, portfolioId)));
  },

  /** Finds an account by ID scoped to user and portfolio. */
  async findByIdScoped(userId: string, portfolioId: string, accountId: string): Promise<AccountTable | null> {
    const db = getDb();
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.portfolioId, portfolioId)))
      .limit(1);
    return account ?? null;
  },
};