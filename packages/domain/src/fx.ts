/**
 * FX conversion helpers for the Investy domain.
 *
 * Foreign assets (US/IE ETFs, crypto) are quoted in native currency and
 * converted to BRL on read using a weekly FX quote (design-03). BDRs are
 * quoted directly in BRL and skip the FX step.
 *
 * FX conversion happens at read/valuation time only and is never persisted.
 */

import type { FxRate, MoneyCents } from './types.js';

/**
 * Converts an amount in USD cents to BRL cents using the given FX rate.
 *
 * The multiplication is performed via Number at the read boundary; this is
 * acceptable because FX conversion is display-only and never persisted.
 *
 * @param priceCentsUSD - Amount in USD integer cents.
 * @param fxRate        - USD→BRL exchange rate (must be positive).
 * @returns Amount in BRL integer cents, rounded to nearest cent.
 * @throws {Error} if fxRate.rate <= 0.
 */
export function convertToBRL(priceCentsUSD: MoneyCents, fxRate: FxRate): MoneyCents {
  if (fxRate.rate <= 0) {
    throw new Error('FX rate must be positive');
  }
  return BigInt(Math.round(Number(priceCentsUSD) * fxRate.rate));
}

/** Creates an FxRate value. */
export function makeFxRate(rate: number, fetchedAt: Date): FxRate {
  return { rate, fetchedAt };
}
