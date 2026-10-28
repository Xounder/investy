import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';

const publicUser = { id: users.id, email: users.email, name: users.name, createdAt: users.createdAt };

export async function updateProfile(userId: string, name: string, email: string) {
  return getDb().update(users)
    .set({ name, email: email.toLowerCase() })
    .where(eq(users.id, userId))
    .returning(publicUser);
}

export function isDuplicateEmail(error: unknown): boolean {
  // PostgreSQL unique_violation can be wrapped by the driver.
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;
  return cause !== null && typeof cause === 'object' && 'code' in cause && cause.code === '23505'
    && 'constraint' in cause && cause.constraint === 'users_email_idx';
}
