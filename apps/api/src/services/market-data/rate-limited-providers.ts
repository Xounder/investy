/**
 * Rate-limited provider instances (ADR-003).
 *
 * This module exports pre-wrapped rate-limited provider instances to avoid
 * circular imports between index.ts (which initializes the registry) and
 * fx.ts (which needs the rate-limited providers for FX fetching).
 *
 * The providers are lazily initialized to allow test mocking of the raw providers.
 * Uses dynamic import() for proper ESM module resolution.
 */
import { RateLimitedProvider, DEFAULT_PROVIDER_QUOTAS } from './provider-rate-limit.js';

let _limitedBrapiProvider: RateLimitedProvider | null = null;
let _limitedBcbSgsProvider: RateLimitedProvider | null = null;
let _limitedYahooProvider: RateLimitedProvider | null = null;
let _limitedCoingeckoProvider: RateLimitedProvider | null = null;

/** Gets the rate-limited brapi provider (lazy init). */
export async function getLimitedBrapiProvider(): Promise<RateLimitedProvider> {
  if (!_limitedBrapiProvider) {
    const { brapiProvider } = await import('./brapi.js');
    _limitedBrapiProvider = new RateLimitedProvider(brapiProvider, DEFAULT_PROVIDER_QUOTAS.brapi);
  }
  return _limitedBrapiProvider;
}

/** Gets the rate-limited BCB SGS provider (lazy init). */
export async function getLimitedBcbSgsProvider(): Promise<RateLimitedProvider> {
  if (!_limitedBcbSgsProvider) {
    const { bcbSgsProvider } = await import('./bcb-sgs.js');
    _limitedBcbSgsProvider = new RateLimitedProvider(bcbSgsProvider, DEFAULT_PROVIDER_QUOTAS.bcb);
  }
  return _limitedBcbSgsProvider;
}

/** Gets the rate-limited Yahoo Finance provider (lazy init). */
export async function getLimitedYahooProvider(): Promise<RateLimitedProvider> {
  if (!_limitedYahooProvider) {
    const { yahooProvider } = await import('./yahoo.js');
    _limitedYahooProvider = new RateLimitedProvider(yahooProvider, DEFAULT_PROVIDER_QUOTAS.yahoo);
  }
  return _limitedYahooProvider;
}

/** Gets the rate-limited CoinGecko provider (lazy init). */
export async function getLimitedCoingeckoProvider(): Promise<RateLimitedProvider> {
  if (!_limitedCoingeckoProvider) {
    const { coingeckoProvider } = await import('./coingecko.js');
    _limitedCoingeckoProvider = new RateLimitedProvider(coingeckoProvider, DEFAULT_PROVIDER_QUOTAS.coingecko);
  }
  return _limitedCoingeckoProvider;
}

/** Resets all cached rate-limited providers (for testing). */
export function resetRateLimitedProviders(): void {
  _limitedBrapiProvider = null;
  _limitedBcbSgsProvider = null;
  _limitedYahooProvider = null;
  _limitedCoingeckoProvider = null;
}