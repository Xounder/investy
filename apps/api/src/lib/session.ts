/**
 * Session management for Investy (ADR-006/ADR-010).
 *
 * Uses stateless signed tokens (HMAC-SHA256) stored in httpOnly cookies.
 * The cookie value is `base64url(payload).base64url(signature)` where the
 * payload is a JSON object `{ userId, expiresAt }`.
 *
 * A SECRET must be provided via the SESSION_SECRET environment variable in
 * production; a random ephemeral secret is used as a development fallback so
 * the API boots without configuration.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionPayload {
  userId: string;
  expiresAt: number;
  nonce?: string;
}

let devSecret: string | null = null;

function getSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (!devSecret) {
    devSecret = randomBytes(48).toString('hex');
  }
  return devSecret;
}

function hmacSign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url');
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/** Creates a signed session token for a user. */
export function createSessionToken(userId: string, ttlMs = SESSION_TTL_MS, nonce?: string): string {
  const payload: SessionPayload = {
    userId,
    expiresAt: Date.now() + ttlMs,
    ...(nonce === undefined ? {} : { nonce }),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = hmacSign(encoded);
  return `${encoded}.${signature}`;
}

/** Only the digest is persisted; the signed bearer token stays in the cookie. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Unlike the pure factory, every persisted session has a unique random nonce. */
export function createPersistedSessionToken(userId: string): string {
  return createSessionToken(userId, SESSION_TTL_MS, randomBytes(32).toString('hex'));
}

/**
 * Verifies a session token and returns the payload, or null when the token is
 * malformed, tampered with, or expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === token.length - 1) {
    return null;
  }

  const encoded = token.slice(0, dotIndex);
  const providedSignature = token.slice(dotIndex + 1);
  const expectedSignature = hmacSign(encoded);

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;
    if (
      !payload || typeof payload !== 'object' ||
      Object.keys(payload).some((key) => !['userId', 'expiresAt', 'nonce'].includes(key)) ||
      typeof payload.userId !== 'string' ||
      payload.userId.length === 0 ||
      typeof payload.expiresAt !== 'number' ||
      !Number.isFinite(payload.expiresAt) ||
      (payload.nonce !== undefined && !/^[a-f0-9]{64}$/.test(payload.nonce))
    ) {
      return null;
    }
    if (payload.expiresAt <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Creates a signed single-use token for password reset. Carries the target
 * user id and a short expiry window.
 */
export function createPasswordResetToken(
  userId: string,
  ttlMs = 60 * 60 * 1000,
): string {
  const payload: SessionPayload = {
    userId,
    expiresAt: Date.now() + ttlMs,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = hmacSign(encoded);
  return `${encoded}.${signature}`;
}

/** Verifies a password-reset token. */
export function verifyPasswordResetToken(
  token: string,
): SessionPayload | null {
  return verifySessionToken(token);
}
