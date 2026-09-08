/**
 * User repository (ownership-scoped where applicable).
 * Users are looked up by email (for auth) or ID (scoped).
 */
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { UserTable, NewUser } from '../db/schema.js';

export const userRepository = {
  /** Finds a user by email (used for login/register — not ownership-scoped). */
  async findByEmail(email: string): Promise<UserTable | null> {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  },

  /** Finds a user by ID (ownership-scoped). */
  async findById(id: string): Promise<UserTable | null> {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  },

  /** Creates a new user. */
  async create(data: NewUser): Promise<UserTable> {
    const db = getDb();
    const [user] = await db.insert(users).values(data).returning();
    if (!user) throw new Error('Failed to create user');
    return user;
  },

  /** Updates a user's password hash. */
  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const db = getDb();
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  },
};