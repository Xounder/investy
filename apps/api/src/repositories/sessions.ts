/**
 * Session repository (ownership-scoped).
 * Sessions are always scoped to a user.
 */
import { getDb } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { eq, and, lt } from 'drizzle-orm';
import type { SessionTable, NewSession } from '../db/schema.js';
import { createScopedRepository } from './base.js';

export const sessionRepository = {
  ...createScopedRepository(sessions, sessions.userId),

  /** Finds a session by token (not ownership-scoped — token is unique). */
  async findByToken(token: string): Promise<SessionTable | null> {
    const db = getDb();
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
    return session ?? null;
  },

  /** Creates a new session. */
  async create(data: NewSession): Promise<SessionTable> {
    const db = getDb();
    const [session] = await db.insert(sessions).values(data).returning();
    if (!session) throw new Error('Failed to create session');
    return session;
  },

  /** Deletes expired sessions for a user (cleanup). */
  async deleteExpired(userId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
    return result.rowCount ?? 0;
  },

  /** Deletes all sessions for a user (logout everywhere). */
  async deleteAllForUser(userId: string): Promise<number> {
    const db = getDb();
    const result = await db.delete(sessions).where(eq(sessions.userId, userId));
    return result.rowCount ?? 0;
  },
};