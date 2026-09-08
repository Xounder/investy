import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../src/lib/password.js';

describe('Password hashing (Argon2id)', () => {
  it('hashes and verifies a password', async () => {
    const password = 'my-secure-password-123';
    const hash = await hashPassword(password);

    const valid = await verifyPassword(password, hash);

    expect(valid).toBe(true);
  });

  it('rejects incorrect password', async () => {
    const password = 'my-secure-password-123';
    const wrongPassword = 'wrong-password';
    const hash = await hashPassword(password);

    const valid = await verifyPassword(wrongPassword, hash);

    expect(valid).toBe(false);
  });

  it('produces different hashes for same password (salt)', async () => {
    const password = 'my-secure-password-123';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
    // Both should verify
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });

  it('handles empty password', async () => {
    const password = '';
    const hash = await hashPassword(password);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it('handles long password', async () => {
    const password = 'a'.repeat(128); // Max length per schema
    const hash = await hashPassword(password);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it('rejects completely different hash format', async () => {
    const password = 'test';
    const fakeHash = '$argon2id$v=19$m=19456,t=2,p=1$invalid$somesignature';

    let valid = false;
    try {
      valid = await verifyPassword(password, fakeHash);
    } catch {
      // verify throws on invalid hash format
      valid = false;
    }

    expect(valid).toBe(false);
  });
});