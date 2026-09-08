/**
 * Rate limiting middleware (ADR-010).
 *
 * Sliding window rate limiter using an in-memory Map. Suitable for single-instance
 * deployments; for multi-instance, replace with Redis-backed store.
 */
import type { Context, Next } from 'hono';

export interface RateLimitConfig {
  /** Maximum requests allowed in the window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
  /** Key generator — defaults to client IP. */
  keyGenerator?: (c: Context) => string;
  /** Handler when limit is exceeded — defaults to 429 JSON response. */
  handler?: (c: Context) => Response | undefined;
  /** Whether to include rate limit headers in response. */
  headers?: boolean;
}

interface WindowEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, WindowEntry>();

/** Cleans expired entries from the store periodically. */
function cleanupStore(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime <= now) {
      store.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupStore, 60_000);

/** Resets the rate limit store (for testing purposes). */
export function resetRateLimitStore(): void {
  store.clear();
}

/**
 * Creates a rate limiting middleware with the given configuration.
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    max,
    windowMs,
    keyGenerator = (c) => c.req.header('x-forwarded-for') ?? 'unknown',
    handler = defaultHandler,
    headers = true,
  } = config;

  return async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | undefined> {
    const key = keyGenerator(c);
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || entry.resetTime <= now) {
      entry = { count: 0, resetTime: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

    if (headers) {
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(resetSeconds));
    }

    if (entry.count > max) {
      return handler(c);
    }

    await next();
    return undefined;
  };
}

function defaultHandler(c: Context): Response | undefined {
  return c.json(
    {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    },
    429,
  );
}

/**
 * Pre-configured rate limiter for auth routes (brute-force protection).
 * Allows 10 requests per 15 minutes per IP.
 */
export const authRateLimit = rateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000, // 15 minutes
  keyGenerator: (c) => `auth:${c.req.header('x-forwarded-for') ?? 'unknown'}`,
});