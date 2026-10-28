/**
 * Yahoo Finance provider (US/IE ETFs in USD).
 *
 * Uses Yahoo Finance chart API (unofficial, no API key required).
 * Primary provider for US-listed ETFs (etf_us) and Ireland-domiciled ETFs (etf_ie).
 */
import { QuoteProvider, QuoteResult } from './quote-provider.js';
import type { AssetClass } from '@investy/domain';
import type { IndexObservation } from './quote-provider.js';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        chartPreviousClose?: number;
        previousClose?: number;
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

  /** Yahoo's raw chart close (not adjusted close); dates come from exchange-local observations. */
  async fetchIndexHistory(symbol: string, start: string, end: string): Promise<IndexObservation[] | null> {
    const zones: Record<string, string> = {
      '^BVSP': 'America/Sao_Paulo', '^IFIX': 'America/Sao_Paulo', '^GSPC': 'America/New_York',
    };
    const zone = zones[symbol];
    if (!zone || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      start > end || Number.isNaN(Date.parse(`${start}T00:00:00Z`))) return null;
    const period1 = Math.floor(Date.parse(`${start}T00:00:00Z`) / 1000);
    const period2 = Math.floor(Date.parse(`${end}T00:00:00Z`) / 1000) + 86_400;
    const response = await this.fetchWithTimeout(`${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}` +
      `?interval=1d&period1=${period1}&period2=${period2}`);
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('chart' in payload)) return null;
    const chart = (payload as { chart?: { result?: Array<{
      meta?: { symbol?: string; exchangeTimezoneName?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }> | null } }).chart;
    const item = chart?.result?.[0];
    if (item?.meta?.symbol?.toUpperCase() !== symbol ||
      (item.meta.exchangeTimezoneName && item.meta.exchangeTimezoneName !== zone)) return null;
    const times = item.timestamp;
    const closes = item.indicators?.quote?.[0]?.close;
    if (!Array.isArray(times) || !Array.isArray(closes) || times.length !== closes.length || times.length > 100) return null;
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit' });
    const result: IndexObservation[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < times.length; i++) {
      const time = times[i], points = closes[i];
      if (!Number.isSafeInteger(time) || typeof points !== 'number' || !Number.isFinite(points) || points <= 0) continue;
      const parts = formatter.formatToParts(new Date(time! * 1000));
      const field = (name: string) => parts.find((part) => part.type === name)?.value ?? '';
      const date = `${field('year')}-${field('month')}-${field('day')}`;
      if (date < start || date > end || seen.has(date)) continue;
      seen.add(date);
      result.push({ date, points });
    }
    return result;
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

    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return null;
    }

    const priceCents = BigInt(Math.round(price * 100));
    const currency = meta.currency ?? 'USD';
    const previous = meta.chartPreviousClose ?? meta.previousClose;
    const previousCloseCents = typeof previous === 'number' && Number.isFinite(previous) && previous > 0
      ? BigInt(Math.round(previous * 100)) : null;

    return {
      priceCents,
      ...(previousCloseCents !== null && previousCloseCents > 0n ? { previousCloseCents } : {}),
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
