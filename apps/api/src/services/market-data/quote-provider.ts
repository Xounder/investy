/**
 * QuoteProvider interface (ADR-003).
 *
 * Provider-agnostic interface for fetching market quotes.
 * All providers implement this interface; domain logic depends only on this
 * abstraction, never on concrete vendor implementations.
 */
import type { AssetClass } from '@investy/domain';

/** A fetched quote from a provider. */
export interface QuoteResult {
  /** Price in integer cents of the asset's native currency. */
  priceCents: bigint;
  /** ISO 4217 currency code (e.g., 'BRL', 'USD'). */
  currency: string;
  /** Provider identifier (e.g., 'brapi', 'yahoo', 'coingecko', 'bcb'). */
  source: string;
}

/** Provider interface for fetching quotes. */
export interface QuoteProvider {
  /** Unique provider identifier. */
  readonly name: string;

  /**
   * Fetches a quote for the given symbol and asset class.
   * @param symbol - Asset symbol (e.g., 'PETR4', 'IVVB11', 'AAPL', 'BTC').
   * @param assetClass - Asset class to determine the correct endpoint.
   * @returns Quote result or null if not found/unavailable.
   */
  fetchQuote(symbol: string, assetClass: AssetClass): Promise<QuoteResult | null>;

  /**
   * Checks if this provider supports the given asset class.
   * @param assetClass - Asset class to check.
   * @returns True if the provider can fetch quotes for this class.
   */
  supports(assetClass: AssetClass): boolean;
}

/** Provider registry for managing primary/fallback chains. */
export class ProviderRegistry {
  private providers: Map<string, QuoteProvider[]> = new Map();

  /**
   * Registers a provider for an asset class.
   * Providers are tried in registration order (first = primary).
   * Idempotent: skips if the same provider (by name) is already registered for this asset class.
   */
  register(assetClass: AssetClass, provider: QuoteProvider): void {
    const existing = this.providers.get(assetClass) ?? [];
    // Check if provider with same name already registered for this asset class
    const alreadyRegistered = existing.some(p => p.name === provider.name);
    if (alreadyRegistered) {
      return;
    }
    existing.push(provider);
    this.providers.set(assetClass, existing);
  }

  /**
   * Gets all providers registered for an asset class, in priority order.
   */
  getProviders(assetClass: AssetClass): QuoteProvider[] {
    return this.providers.get(assetClass) ?? [];
  }

  /**
   * Tries providers in order until one returns a quote.
   */
  async fetchWithFallback(
    symbol: string,
    assetClass: AssetClass,
  ): Promise<QuoteResult | null> {
    const providers = this.getProviders(assetClass);
    for (const provider of providers) {
      try {
        const quote = await provider.fetchQuote(symbol, assetClass);
        if (quote) {
          return quote;
        }
      } catch (error) {
        // Log and continue to next provider
        console.warn(
          `[MarketData] Provider ${provider.name} failed for ${symbol} (${assetClass}):`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return null;
  }
}

/** Global provider registry instance. */
export const providerRegistry = new ProviderRegistry();