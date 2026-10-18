/**
 * Market Data Services (ADR-003).
 *
 * Exports all market data related services:
 * - Provider interface and implementations
 * - Quote cache with TTL
 * - FX rate management
 * - Manual quote overrides
 * - Provider rate limiting / quota budgeting
 */
export * from './quote-provider.js';
export * from './brapi.js';
export * from './bcb-sgs.js';
export * from './yahoo.js';
export * from './coingecko.js';
export * from './cache.js';
export * from './fx.js';
export * from './overrides.js';
export * from './provider-rate-limit.js';
export * from './rate-limited-providers.js';

/** Initializes the provider registry with default providers. */
import { providerRegistry } from './quote-provider.js';
import {
  getLimitedBrapiProvider,
  getLimitedBcbSgsProvider,
  getLimitedYahooProvider,
  getLimitedCoingeckoProvider,
  resetRateLimitedProviders,
} from './rate-limited-providers.js';

let providersInitialized = false;

/** Initializes the provider registry with default providers. Idempotent. */
export async function initializeProviders(): Promise<void> {
  if (providersInitialized) {
    return;
  }

  // B3 assets: brapi primary (rate limited)
  providerRegistry.register('acao', await getLimitedBrapiProvider());
  providerRegistry.register('fii', await getLimitedBrapiProvider());
  providerRegistry.register('etf', await getLimitedBrapiProvider()); // Brazilian ETFs
  providerRegistry.register('bdr', await getLimitedBrapiProvider()); // BDRs quoted in BRL
  providerRegistry.register('crypto', await getLimitedBrapiProvider()); // brapi has crypto
  providerRegistry.register('indice', await getLimitedBrapiProvider());

  // Macro indicators: BCB primary (rate limited), brapi fallback
  providerRegistry.register('indice', await getLimitedBcbSgsProvider());

  // US/IE ETFs: Yahoo primary (rate limited)
  providerRegistry.register('etf_us', await getLimitedYahooProvider());
  providerRegistry.register('etf_ie', await getLimitedYahooProvider());

  // Crypto fallback: CoinGecko (rate limited)
  providerRegistry.register('crypto', await getLimitedCoingeckoProvider());

  // RF and Tesouro: no live provider yet (could add later)

  providersInitialized = true;
}

/** Resets the initialization flag (for testing purposes). */
export function resetProvidersInitialized(): void {
  providersInitialized = false;
  resetRateLimitedProviders();
}