/**
 * Provider rate limiting / quota budgeting for market data providers.
 *
 * Simple in-memory quota guard per provider. Tracks requests per provider
 * and blocks when quota is exceeded. Suitable for single-instance deployments.
 */
import { QuoteProvider, QuoteResult } from './quote-provider.js';
import type { AssetClass } from '@investy/domain';

interface QuotaEntry {
  count: number;
  resetTime: number;
}

interface ProviderQuotaConfig {
  /** Maximum requests allowed in the window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

const quotaStore = new Map<string, QuotaEntry>();

/** Cleans expired entries from the store periodically. */
function cleanupQuotaStore(): void {
  const now = Date.now();
  for (const [key, entry] of quotaStore.entries()) {
    if (entry.resetTime <= now) {
      quotaStore.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupQuotaStore, 60_000);

/** Resets the quota store (for testing purposes). */
export function resetProviderQuotaStore(): void {
  quotaStore.clear();
}

/**
 * Default quota configurations per provider.
 * Brapi: ~30 req/min on free tier, we use 25 to be safe
 * BCB SGS: no official limit, use 100/min
 * Yahoo Finance: unofficial, use 30/min
 * CoinGecko: 10-30/min on free tier, use 20/min
 */
export const DEFAULT_PROVIDER_QUOTAS: Record<string, ProviderQuotaConfig> = {
  brapi: { max: 25, windowMs: 60_000 },
  bcb: { max: 100, windowMs: 60_000 },
  yahoo: { max: 30, windowMs: 60_000 },
  coingecko: { max: 20, windowMs: 60_000 },
};

/**
 * Checks and consumes quota for a provider.
 * Returns true if quota available, false if exceeded.
 */
export function checkProviderQuota(providerName: string, config?: ProviderQuotaConfig): boolean {
  const quotaConfig = config ?? DEFAULT_PROVIDER_QUOTAS[providerName] ?? { max: 30, windowMs: 60_000 };
  const now = Date.now();
  const key = `provider:${providerName}`;

  let entry = quotaStore.get(key);

  if (!entry || entry.resetTime <= now) {
    entry = { count: 0, resetTime: now + quotaConfig.windowMs };
    quotaStore.set(key, entry);
  }

  entry.count += 1;

  return entry.count <= quotaConfig.max;
}

/**
 * Gets current quota status for a provider.
 */
export function getProviderQuotaStatus(providerName: string): { used: number; remaining: number; max: number; resetSeconds: number } | null {
  const config = DEFAULT_PROVIDER_QUOTAS[providerName] ?? { max: 30, windowMs: 60_000 };
  const now = Date.now();
  const key = `provider:${providerName}`;
  const entry = quotaStore.get(key);

  if (!entry || entry.resetTime <= now) {
    return { used: 0, remaining: config.max, max: config.max, resetSeconds: Math.ceil(config.windowMs / 1000) };
  }

  const remaining = Math.max(0, config.max - entry.count);
  const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

  return {
    used: entry.count,
    remaining,
    max: config.max,
    resetSeconds,
  };
}

/**
 * A rate-limited wrapper around a QuoteProvider that enforces quota limits.
 * When quota is exceeded, returns null (cache will be used as fallback).
 */
export class RateLimitedProvider implements QuoteProvider {
  readonly name: string;
  private readonly inner: QuoteProvider;
  private readonly config: ProviderQuotaConfig;

  constructor(provider: QuoteProvider, config?: ProviderQuotaConfig) {
    this.inner = provider;
    this.name = provider.name;
    this.config = config ?? DEFAULT_PROVIDER_QUOTAS[provider.name] ?? { max: 30, windowMs: 60_000 };
  }

  supports(assetClass: AssetClass): boolean {
    return this.inner.supports(assetClass);
  }

  async fetchQuote(symbol: string, assetClass: AssetClass): Promise<QuoteResult | null> {
    if (!checkProviderQuota(this.name, this.config)) {
      console.warn(`[MarketData] Provider ${this.name} quota exceeded, skipping fetch`);
      return null;
    }
    return this.inner.fetchQuote(symbol, assetClass);
  }
}