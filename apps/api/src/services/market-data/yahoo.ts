/**
 * Yahoo Finance provider (US/IE ETFs in USD).
 *
 * Uses Yahoo Finance chart API (unofficial, no API key required).
 * Primary provider for US-listed ETFs (etf_us) and Ireland-domiciled ETFs (etf_ie).
 */
import { QuoteProvider, QuoteResult } from './quote-provider.js';
import type { AssetClass } from '@investy/domain';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        currency: string;
        symbol: string;
      };
    }> | null;
    error: unknown;
  };
}

export class YahooProvider implements QuoteProvider {
  readonly name = 'yahoo';

  supports(assetClass: AssetClass): boolean {
    return ['etf_us', 'etf_ie'].includes(assetClass);
  }

  async fetchQuote(symbol: string, assetClass: AssetClass): Promise<QuoteResult | null> {
    if (!this.supports(assetClass)) {
      return null;
    }

    // Yahoo uses ticker symbols directly (e.g., IVV, VOO, CSPX.L)
    const url = `${YAHOO_BASE_URL}/${symbol}?interval=1d&range=1d`;
    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Yahoo Finance rate limit exceeded');
      }
      return null;
    }

    const data = await response.json() as YahooChartResponse;

    if (!data.chart?.result || data.chart.result.length === 0) {
      return null;
    }

    const result = data.chart.result[0];
    if (!result) {
      return null;
    }
    const meta = result.meta;
    const price = meta.regularMarketPrice;

    if (price === undefined || price === null) {
      return null;
    }

    const priceCents = BigInt(Math.round(price * 100));
    const currency = meta.currency ?? 'USD';

    return {
      priceCents,
      currency,
      source: this.name,
    };
  }

  private async fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Investy/1.0)',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Singleton instance for the app. */
export const yahooProvider = new YahooProvider();