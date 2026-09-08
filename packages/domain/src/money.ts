/**
 * Integer-cent money helpers (ADR-004).
 *
 * All monetary values are stored and computed as integer cents (bigint).
 * Floating-point arithmetic is never used for storage or accumulation.
 * Formatting uses Intl.NumberFormat for display only.
 */

import type { MoneyCents } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Zero cents constant. */
export const ZERO_CENTS: MoneyCents = 0n;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** Creates a MoneyCents value from a number (truncated to integer). */
export function moneyCents(value: number | bigint): MoneyCents {
  return BigInt(typeof value === 'bigint' ? value : Math.trunc(value));
}

/** Converts a decimal BRL value to integer cents (rounds to nearest). */
export function toCents(value: number): MoneyCents {
  return moneyCents(Math.round(value * 100));
}

/** Converts integer cents back to a decimal number (display only). */
export function fromCents(cents: MoneyCents): number {
  return Number(cents) / 100;
}

// ---------------------------------------------------------------------------
// Arithmetic (all bigint — no floats)
// ---------------------------------------------------------------------------

/** Adds two MoneyCents values. */
export function add(a: MoneyCents, b: MoneyCents): MoneyCents {
  return a + b;
}

/** Subtracts `b` from `a`. */
export function subtract(a: MoneyCents, b: MoneyCents): MoneyCents {
  return a - b;
}

/** Multiplies a MoneyCents by an integer factor. */
export function multiply(a: MoneyCents, factor: bigint): MoneyCents {
  return a * factor;
}

/** Divides a MoneyCents by an integer divisor (floor division). Throws on zero. */
export function divide(a: MoneyCents, divisor: bigint): MoneyCents {
  if (divisor === 0n) {
    throw new Error('MoneyCents: division by zero');
  }
  return a / divisor;
}

// ---------------------------------------------------------------------------
// Comparison & display
// ---------------------------------------------------------------------------

/** Compares two MoneyCents: -1 (a < b), 0 (equal), 1 (a > b). */
export function compare(a: MoneyCents, b: MoneyCents): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Formats MoneyCents as BRL currency string (display only, pt-BR locale). */
export function format(cents: MoneyCents): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(cents) / 100);
}
