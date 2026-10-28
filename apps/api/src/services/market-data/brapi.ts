/**
 * brapi.dev provider (B3 stocks, FIIs, ETFs, BDRs, crypto, indicators).
 *
 * Primary provider for Brazilian assets. Uses the public brapi.dev API.
 * Rate limited: ~30 req/min on free tier.
 */
import { QuoteProvider, QuoteResult } from './quote-provider.js';
import type { AssetClass } from '@investy/domain';

const BRAPI_BASE_URL = 'https://brapi.dev/api';

interface BrapiQuoteResponse {
  results: Array<{
    symbol: string;
    regularMarketPrice: number;
    regularMarketPreviousClose?: number;
    currency: string;
    shortName?: string;
  }>;
}

interface BrapiIndicatorsResponse {
  results: Array<{
    symbol: string;
    name: string;
    regularMarketPrice: number;
    regularMarketPreviousClose?: number;
    currency: string;
  }>;
}

export class BrapiProvider implements QuoteProvider {
  readonly name = 'brapi';

  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.BRAPI_API_KEY;
  }

  supports(assetClass: AssetClass): boolean {
    return [
      'acao',
      'fii',
      'etf',
      'bdr',
      'crypto',
      'indice',
    ].includes(assetClass);
  }

  async fetchQuote(symbol: string, assetClass: AssetClass): Promise<QuoteResult | null> {
    if (!this.supports(assetClass)) {
      return null;
    }

    const url = this.buildUrl(symbol, assetClass);
    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('brapi rate limit exceeded');
      }
      return null;
    }

    const data = await response.json() as BrapiQuoteResponse | BrapiIndicatorsResponse;

    if (!data.results || data.results.length === 0) {
      return null;
    }

    const result = data.results[0];
    if (!result) {
      return null;
    }
    const price = result.regularMarketPrice;

    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return null;
    }

    // Convert to cents (brapi returns price in the asset's currency)
    const priceCents = BigInt(Math.round(price * 100));
    const currency = result.currency ?? 'BRL';
    const previous = result.regularMarketPreviousClose;
    const previousCloseCents = typeof previous === 'number' && Number.isFinite(previous) && previous > 0
      ? BigInt(Math.round(previous * 100)) : null;

    return {
      priceCents,
      ...(previousCloseCents !== null && previousCloseCents > 0n ? { previousCloseCents } : {}),
      currency,
      source: this.name,
    };
  }

  private buildUrl(symbol: string, assetClass: AssetClass): string {
    const params = new URLSearchParams();

    if (assetClass === 'indice') {
      // Indicators endpoint for CDI, SELIC, IPCA, IBOV, IFIX
      params.set('interval', '1d');
    } else {
      params.set('interval', '1d');
    }

    // The API key is never placed in the URL query string. brapi's security
    // guidance requires keeping the key out of URLs and logs (query-string
    // tokens end up in proxy/server logs, browser history, and error messages).
    // Authentication is sent via the `Authorization` header in fetchWithTimeout.

    // brapi uses different endpoints
    let endpoint: string;
    if (assetClass === 'indice') {
      endpoint = `${BRAPI_BASE_URL}/v2/quote/${symbol}`;
    } else {
      endpoint = `${BRAPI_BASE_URL}/quote/${symbol}`;
    }

    return `${endpoint}?${params.toString()}`;
  }

  private async fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Singleton instance for the app. */
export const brapiProvider = new BrapiProvider();
