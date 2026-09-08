/**
 * Password hashing helpers (ARD-006).
 *
 * Uses Argon2id via @node-rs/argon2 (pre-built native module).
 */
import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  // Argon2id algorithm identifier (Algorithm.Argon2id = 2)
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/** Hashes a plaintext password with Argon2id. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Verifies a plaintext password against an Argon2id hash. */
export async function verifyPassword(
  password: string,
  hashed: string,
): Promise<boolean> {
  return verify(hashed, password);
}