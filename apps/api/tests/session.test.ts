import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  verifySessionToken,
  SESSION_TTL_MS,
  createPasswordResetToken,
  verifyPasswordResetToken,
} from '../src/lib/session.js';

describe('Session token round-trip', () => {
  it('creates and verifies a valid session token', () => {
    const userId = 'test-user-id';
    const token = createSessionToken(userId);

    const payload = verifySessionToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(userId);
    expect(payload?.expiresAt).toBeGreaterThan(Date.now());
    expect(payload?.expiresAt).toBeLessThanOrEqual(Date.now() + SESSION_TTL_MS + 1000);
  });

  it('rejects a tampered token', () => {
    const userId = 'test-user-id';
    const token = createSessionToken(userId);
    // Tamper with the payload
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}a.${parts[1]}`;

    const payload = verifySessionToken(tamperedToken);

    expect(payload).toBeNull();
  });

  it('rejects an expired token', () => {
    const userId = 'test-user-id';
    // Create token with negative TTL (already expired)
    const token = createSessionToken(userId, -1000);

    const payload = verifySessionToken(token);

    expect(payload).toBeNull();
  });

  it('rejects a malformed token', () => {
    const payload = verifySessionToken('not.a.valid.token');
    expect(payload).toBeNull();
  });

  it('rejects a token with invalid signature', () => {
    const token = 'eyJ1c2VySWQiOiJ0ZXN0IiwiZXhwaXJlc0F0IjoxOTAwMDAwMDAwMDAwfQ.invalid-signature';
    const payload = verifySessionToken(token);
    expect(payload).toBeNull();
  });

  it('creates and verifies password reset token', () => {
    const userId = 'test-user-id';
    const token = createPasswordResetToken(userId, 60 * 60 * 1000);

    const payload = verifyPasswordResetToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(userId);
  });

  it('password reset token expires', () => {
    const userId = 'test-user-id';
    const token = createPasswordResetToken(userId, -1000);

    const payload = verifyPasswordResetToken(token);

    expect(payload).toBeNull();
  });
});