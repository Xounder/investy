/**
 * BCB SGS provider (Selic, CDI, IPCA).
 *
 * Official Brazilian Central Bank data via SGS (Sistema Gerenciador de Séries
 * Temporais). Free, no API key required.
 */
import { QuoteProvider, QuoteResult } from './quote-provider.js';
import type { DailyRateObservation } from './quote-provider.js';
import type { AssetClass } from '@investy/domain';

const BCB_SGS_BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

/** SGS series codes for macro indicators. */
export const BCB_SERIES = {
  SELIC: 11,    // Selic rate (% per day)
  // BCB SGS SOAP metadata: https://www3.bcb.gov.br/wssgs/services/FachadaWSSGS?method=getUltimoValorXML&in0=12
  // <PERIODICIDADE>D</PERIODICIDADE><UNIDADE>% a.d.</UNIDADE> (daily percent).
  CDI: 12,
  IPCA: 433,    // IPCA (% monthly)
  IBOV: 7858,   // IBOVESPA index (points)
} as const;

interface BCBResponse {
  data: string;        // DD/MM/YYYY
  valor: string;       // value as string
}

export class BcbSgsProvider implements QuoteProvider {
  readonly name = 'bcb';

  /** SGS 12 daily CDI, cross-checked against SGS 11's business-day calendar. */
  async fetchDailyRateHistory(start: string, end: string): Promise<DailyRateObservation[] | null> {
    const from = start.split('-').reverse().join('/');
    const to = end.split('-').reverse().join('/');
    const get = async (code: number): Promise<BCBResponse[] | null> => {
      const response = await this.fetchWithTimeout(`${BCB_SGS_BASE_URL}.${code}/dados?formato=json&dataInicial=${encodeURIComponent(from)}&dataFinal=${encodeURIComponent(to)}`);
      if (!response.ok) return null;
      const data: unknown = await response.json();
      return Array.isArray(data) ? data as BCBResponse[] : null;
    };
    const cdi = await get(12);
    const calendar = await get(11);
    if (!cdi?.length || !calendar?.length) return null;
    const parseDate = (date: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(date)
      ? date.split('/').reverse().join('-') : null;
    const officialDates = calendar.map(row => parseDate(row.data));
    const rows = cdi.map(row => ({ date: parseDate(row.data), percentPerDay: Number(row.valor) }));
    const lastCdiDate = rows.reduce<string>((last, row) => row.date && row.date > last ? row.date : last, '');
    if (officialDates.some(date => !date || date < start || date > end) ||
        rows.some(row => !row.date || row.date < start || row.date > end ||
          !Number.isFinite(row.percentPerDay) || row.percentPerDay < 0 || row.percentPerDay > 5) ||
        new Set(officialDates).size !== officialDates.length ||
        new Set(rows.map(row => row.date)).size !== rows.length ||
        // SGS 11 can publish ahead of SGS 12. Only compare through CDI's last close.
        officialDates.filter(date => date! <= lastCdiDate).length !== rows.length ||
        rows.some(row => !officialDates.includes(row.date))) return null;
    return rows as DailyRateObservation[];
  }

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

    const url = `${BCB_SGS_BASE_URL}.${seriesCode}/dados/ultimos/1?formato=json`;
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
