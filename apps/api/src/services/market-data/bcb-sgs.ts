/**
 * BCB SGS provider (Selic, CDI, IPCA).
 *
 * Official Brazilian Central Bank data via SGS (Sistema Gerenciador de Séries
 * Temporais). Free, no API key required.
 */
import { QuoteProvider, QuoteResult } from './quote-provider.js';
import type { AssetClass } from '@investy/domain';

const BCB_SGS_BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

/** SGS series codes for macro indicators. */
export const BCB_SERIES = {
  SELIC: 11,    // Selic rate (% a.a.)
  CDI: 12,      // CDI rate (% a.a.)
  IPCA: 433,    // IPCA (% monthly)
  IBOV: 7858,   // IBOVESPA index (points)
} as const;

interface BCBResponse {
  data: string;        // DD/MM/YYYY
  valor: string;       // value as string
}

export class BcbSgsProvider implements QuoteProvider {
  readonly name = 'bcb';

  supports(assetClass: AssetClass): boolean {
    return assetClass === 'indice';
  }

  async fetchQuote(symbol: string, assetClass: AssetClass): Promise<QuoteResult | null> {
    if (!this.supports(assetClass)) {
      return null;
    }

    const seriesCode = this.getSeriesCode(symbol);
    if (!seriesCode) {
      return null;
    }

    const url = `${BCB_SGS_BASE_URL}/${seriesCode}/ultimos/1?formato=json`;
    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as BCBResponse[];

    if (!data || data.length === 0) {
      return null;
    }

    const latest = data[0];
    if (!latest) {
      return null;
    }
    const value = parseFloat(latest.valor);

    if (isNaN(value)) {
      return null;
    }

    // BCB returns percentage rates (e.g., 13.75 for 13.75%)
    // Store as basis points (10000 = 100%) for consistency
    // For indices like IBOV, store the raw value * 100 (cents equivalent)
    let priceCents: bigint;
    if (symbol === 'IBOV' || symbol === 'IFIX') {
      priceCents = BigInt(Math.round(value * 100));
    } else {
      // Rates: convert % to basis points (1% = 100 bps)
      priceCents = BigInt(Math.round(value * 100));
    }

    return {
      priceCents,
      currency: 'BRL',
      source: this.name,
    };
  }

  private getSeriesCode(symbol: string): number | null {
    const upperSymbol = symbol.toUpperCase();
    if (upperSymbol === 'SELIC' || upperSymbol === 'CDI') {
      return BCB_SERIES[upperSymbol as keyof typeof BCB_SERIES] ?? null;
    }
    if (upperSymbol === 'IPCA') {
      return BCB_SERIES.IPCA;
    }
    if (upperSymbol === 'IBOV') {
      return BCB_SERIES.IBOV;
    }
    // CDI is often requested as 12 but sometimes 4391 (CDI diario)
    if (upperSymbol === 'CDI_DIARIO') {
      return 4391;
    }
    return null;
  }

  private async fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Singleton instance for the app. */
export const bcbSgsProvider = new BcbSgsProvider();