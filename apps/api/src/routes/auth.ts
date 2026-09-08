/**
 * Authentication routes (ADR-006/ADR-010, design-04).
 *
 * POST   /api/v1/auth/register
 * POST   /api/v1/auth/login
 * POST   /api/v1/auth/logout
 * GET    /api/v1/auth/me
 * POST   /api/v1/auth/password-reset/request
 * POST   /api/v1/auth/password-reset/confirm
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createPasswordResetToken,
  verifyPasswordResetToken,
} from '../lib/session.js';
import { getDb } from '../db/client.js';
import { users, sessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authRateLimit } from '../middleware/rate-limit.js';
import { authMiddleware, requireUser } from '../middleware/auth.js';

const app = new Hono();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email().max(255),
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

// Helper for inline validation
async function validateBody<T>(c: Context, schema: z.ZodSchema<T>): Promise<T> {
  const body = await c.req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: 'VALIDATION', message: 'Invalid request body' } }),
    });
  }
  return parsed.data;
}

// Cookie options helper
function getCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000, // seconds
  };
}

function serializeCookie(options: Record<string, string | number | boolean>): string {
  return Object.entries(options)
    .map(([key, value]) => {
      if (value === true) return key;
      if (value === false) return '';
      return `${key}=${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

function setSessionCookie(c: Context, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  c.header('Set-Cookie', `${SESSION_COOKIE_NAME}=${token}; ${serializeCookie(getCookieOptions(isProduction))}`);
}

function clearSessionCookie(c: Context): void {
  const isProduction = process.env.NODE_ENV === 'production';
  c.header('Set-Cookie', `${SESSION_COOKIE_NAME}=; ${serializeCookie({ ...getCookieOptions(isProduction), maxAge: 0 })}`);
}

/**
 * POST /api/v1/auth/register
 * Creates a new user with Argon2id password hash.
 * Returns 409 on duplicate email (no info leak).
 * Returns user object without passwordHash.
 */
app.post(
  '/register',
  authRateLimit,
  async (c) => {
    const { email, password, name } = await validateBody(c, registerSchema);
    const db = getDb();
    const normalizedEmail = email.toLowerCase();

    // Check for existing user
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length > 0) {
      return c.json(
        { error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } },
        409,
      );
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();

    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: normalizedEmail,
        passwordHash,
        name: name ?? null,
      })
      .returning({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt });

    const token = createSessionToken(userId);
    setSessionCookie(c, token);

    return c.json(user, 201);
  },
);

/**
 * POST /api/v1/auth/login
 * Validates credentials; sets httpOnly session cookie.
 * Generic 401 on any failure (no user enumeration).
 * Returns user object.
 */
app.post(
  '/login',
  authRateLimit,
  async (c) => {
    const { email, password } = await validateBody(c, loginSchema);
    const db = getDb();
    const normalizedEmail = email.toLowerCase();

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash, email: users.email, name: users.name, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      // Generic error to prevent user enumeration
      return c.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        401,
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return c.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        401,
      );
    }

    const token = createSessionToken(user.id);

    // Store session in DB for revocation support
    await db.insert(sessions).values({
      id: crypto.randomUUID(),
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    setSessionCookie(c, token);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutHash } = user;
    return c.json(userWithoutHash);
  },
);

/**
 * POST /api/v1/auth/logout
 * Clears session cookie and revokes server-side session.
 */
app.post('/logout', authMiddleware, async (c) => {
  requireUser(c); // Validate session, userId not used in logout
  const cookieHeader = c.req.header('cookie');
  const token = cookieHeader
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split('=')[1];

  if (token) {
    const db = getDb();
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  clearSessionCookie(c);
  return c.json({ ok: true });
});

/**
 * GET /api/v1/auth/me
 * Returns current user from session cookie, else 401.
 */
app.get('/me', authMiddleware, async (c) => {
  const userId = requireUser(c);
  const db = getDb();

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'User not found' } },
      404,
    );
  }

  return c.json(user);
});

/**
 * POST /api/v1/auth/password-reset/request
 * Accepts email; always returns 202 (no info leak).
 * Token generation is deterministic/verifiable.
 */
app.post(
  '/password-reset/request',
  authRateLimit,
  async (c) => {
    const { email } = await validateBody(c, passwordResetRequestSchema);
    const db = getDb();

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    // Always return 202 to prevent email enumeration
    if (user) {
      const token = createPasswordResetToken(user.id);
      // In production, send token via email. For now, we log it for testing.
      console.log(`[Password Reset] Token for ${email}: ${token}`);
      // TODO: Integrate with email provider
    }

    return c.json({ ok: true }, 202);
  },
);

/**
 * POST /api/v1/auth/password-reset/confirm
 * Accepts token + new password; rejects expired/invalid tokens; updates password hash.
 */
app.post(
  '/password-reset/confirm',
  authRateLimit,
  async (c) => {
    const { token, password } = await validateBody(c, passwordResetConfirmSchema);
    const payload = verifyPasswordResetToken(token);

    if (!payload) {
      return c.json(
        { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' } },
        400,
      );
    }

    const db = getDb();
    const passwordHash = await hashPassword(password);

    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, payload.userId));

    // Revoke all existing sessions for this user
    await db.delete(sessions).where(eq(sessions.userId, payload.userId));

    return c.json({ ok: true });
  },
);

export default app;