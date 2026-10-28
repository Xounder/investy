/**
 * Authentication middleware (ADR-006/ADR-010).
 *
 * Reads the httpOnly `session` cookie, verifies the signed token, checks
 * the session exists in the DB and is not expired, and attaches the
 * authenticated user id to the Hono context as `userId`.
 *
 * Consumers import the `authMiddleware` and the `requireUser` helper
 * (TASK-05/13). Do not change the middleware internals.
 */
import type { Context, Next } from 'hono';

import { SESSION_COOKIE_NAME, verifySessionToken } from '../lib/session.js';
import { sessionRepository } from '../repositories/sessions.js';

export const USER_ID_CONTEXT_KEY = 'userId';

/**
 * Hono middleware that requires a valid session cookie. Responds with 401
 * when the cookie is missing, malformed, expired, or revoked (deleted from DB).
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | undefined> {
  const cookieHeader = c.req.header('cookie');
  const token = extractCookie(cookieHeader, SESSION_COOKIE_NAME);

  if (!token) {
    return c.json(
      {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      401,
    );
  }

  const sessionPayload = verifySessionToken(token);
  if (!sessionPayload) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' } },
      401,
    );
  }

  // Check session exists in DB and is not expired (revocation check)
  const session = await sessionRepository.findByToken(token);
  if (!session || session.expiresAt <= new Date()) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Session expired or revoked' } },
      401,
    );
  }

  c.set(USER_ID_CONTEXT_KEY, sessionPayload.userId);
  await next();
  return undefined;
}

/**
 * Returns the authenticated user id from the Hono context.
 * Throws when the auth middleware has not run.
 */
export function requireUser(c: Context): string {
  const userId = c.get(USER_ID_CONTEXT_KEY);
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('requireUser called outside an authenticated request');
  }
  return userId;
}

/**
 * Optional authentication middleware (ADR-006).
 *
 * Attaches the authenticated user id to the context when the request carries a
 * valid, non-expired session cookie. When the cookie is missing, malformed, or
 * revoked, the request continues unauthenticated instead of responding 401 —
 * unlike `authMiddleware`, which rejects the request. Use it for public
 * endpoints that enrich their response for signed-in users.
 *
 * When an upstream middleware already resolved the user (for example
 * `authMiddleware`), the session is not looked up again.
 */
export async function optionalUser(c: Context, next: Next): Promise<void> {
  if (typeof c.get(USER_ID_CONTEXT_KEY) !== 'string') {
    const token = extractCookie(c.req.header('cookie'), SESSION_COOKIE_NAME);
    if (token) {
      const sessionPayload = verifySessionToken(token);
      if (sessionPayload) {
        const session = await sessionRepository.findByToken(token);
        if (session && session.expiresAt > new Date()) {
          c.set(USER_ID_CONTEXT_KEY, sessionPayload.userId);
        }
      }
    }
  }
  await next();
}

/**
 * Returns the authenticated user id from the Hono context, or null when the
 * request is unauthenticated. Never throws.
 */
export function getOptionalUserId(c: Context): string | null {
  const userId = c.get(USER_ID_CONTEXT_KEY);
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
}

/** Parses a raw Cookie header value for a single cookie name. */
export function extractCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const pair of cookieHeader.split(';')) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = pair.slice(0, eqIndex).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(eqIndex + 1).trim());
    }
  }
  return undefined;
}
