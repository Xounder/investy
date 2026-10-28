import { getDb } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { createPersistedSessionToken, hashSessionToken, SESSION_TTL_MS } from '../lib/session.js';

/** Persists a revocable session before its bearer token may be sent to a client. */
export async function persistSession(db: ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0], userId: string): Promise<string> {
  const token = createPersistedSessionToken(userId);
  await db.insert(sessions).values({
    id: crypto.randomUUID(), userId, token: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}
