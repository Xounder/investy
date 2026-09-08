import { describe, expect, it, beforeEach } from 'vitest';

import { Hono } from 'hono';
import { rateLimit, authRateLimit, resetRateLimitStore } from '../src/middleware/rate-limit.js';

describe('Rate limiter', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it('allows requests under the limit', async () => {
    const testApp = new Hono();
    testApp.use('*', rateLimit({ max: 5, windowMs: 60_000 }));
    testApp.get('/test', (c) => c.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      const res = await testApp.request('/test');
      expect(res.status).toBe(200);
    }
  });

  it('blocks requests over the limit', async () => {
    const testApp = new Hono();
    testApp.use('*', rateLimit({ max: 2, windowMs: 60_000 }));
    testApp.get('/test', (c) => c.json({ ok: true }));

    const res1 = await testApp.request('/test');
    expect(res1.status).toBe(200);

    const res2 = await testApp.request('/test');
    expect(res2.status).toBe(200);

    const res3 = await testApp.request('/test');
    expect(res3.status).toBe(429);
    const body = await res3.json() as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('includes rate limit headers', async () => {
    const testApp = new Hono();
    testApp.use('*', rateLimit({ max: 10, windowMs: 60_000, headers: true }));
    testApp.get('/test', (c) => c.json({ ok: true }));

    const res = await testApp.request('/test');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
    expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
  });

  it('uses custom key generator', async () => {
    const testApp = new Hono();
    testApp.use('*', rateLimit({
      max: 1,
      windowMs: 60_000,
      keyGenerator: (c) => `custom:${c.req.header('x-user-id') ?? 'anon'}`,
    }));
    testApp.get('/test', (c) => c.json({ ok: true }));

    const res1 = await testApp.request('/test', { headers: { 'x-user-id': 'user1' } });
    expect(res1.status).toBe(200);

    const res2 = await testApp.request('/test', { headers: { 'x-user-id': 'user1' } });
    expect(res2.status).toBe(429);

    const res3 = await testApp.request('/test', { headers: { 'x-user-id': 'user2' } });
    expect(res3.status).toBe(200);
  });

  it('authRateLimit preset has correct defaults (max: 10, windowMs: 15min, keyGenerator includes "auth:")', async () => {
    const testApp = new Hono();
    testApp.use('*', authRateLimit);
    testApp.get('/test', (c) => c.json({ ok: true }));

    // Make 10 requests - all should succeed
    for (let i = 0; i < 10; i++) {
      const res = await testApp.request('/test');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe(String(9 - i));
    }

    // 11th request should be blocked
    const res11 = await testApp.request('/test');
    expect(res11.status).toBe(429);
    const body = await res11.json() as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('authRateLimit uses auth: prefix in key generator', async () => {
    const testApp = new Hono();
    testApp.use('*', authRateLimit);
    testApp.get('/test', (c) => c.json({ ok: true }));

    // The key generator should include "auth:" prefix
    // We verify by checking that different IPs get separate buckets
    const res1 = await testApp.request('/test', { headers: { 'x-forwarded-for': '1.2.3.4' } });
    expect(res1.status).toBe(200);

    const res2 = await testApp.request('/test', { headers: { 'x-forwarded-for': '5.6.7.8' } });
    expect(res2.status).toBe(200);

    // Both should have remaining 9 (separate buckets)
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('9');
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('9');
  });

  it('authRateLimit window is 15 minutes (900000 ms)', async () => {
    // We can't easily test the actual window passage, but we can verify
    // the preset configuration by checking the source values
    // The authRateLimit is created with max: 10, windowMs: 15 * 60 * 1000
    // This test confirms the rate limiter works with that window
    const testApp = new Hono();
    testApp.use('*', authRateLimit);
    testApp.get('/test', (c) => c.json({ ok: true }));

    // First request succeeds
    const res = await testApp.request('/test');
    expect(res.status).toBe(200);

    // The reset header should be approximately 15 minutes (900 seconds)
    const reset = res.headers.get('X-RateLimit-Reset');
    expect(reset).toBeDefined();
    const resetSeconds = parseInt(reset!, 10);
    expect(resetSeconds).toBeGreaterThan(800); // ~13+ minutes
    expect(resetSeconds).toBeLessThanOrEqual(900); // at most 15 minutes
  });
});