/**
 * CoinGecko provider (crypto USD fallback).
 *
 * Fallback provider for crypto assets when brapi is unavailable.
 * Free tier: 10-30 req/min, no API key required for basic usage.
 */
import { QuoteProvider, QuoteResult } from './quote-provider.js';
import type { AssetClass } from '@investy/domain';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

/** Mapping from common crypto symbols to CoinGecko IDs. */
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'BNB': 'binancecoin',
  'SOL': 'solana',
  'ADA': 'cardano',
  'XRP': 'ripple',
  'DOGE': 'dogecoin',
  'MATIC': 'matic-network',
  'DOT': 'polkadot',
  'AVAX': 'avalanche-2',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
  'XLM': 'stellar',
  'ATOM': 'cosmos',
  'ETC': 'ethereum-classic',
  'FIL': 'filecoin',
  'TRX': 'tron',
  'XMR': 'monero',
  'VET': 'vechain',
  'THETA': 'theta-token',
  'ALGO': 'algorand',
  'AAVE': 'aave',
  'MKR': 'maker',
  'COMP': 'compound-governance-token',
  'SNX': 'synthetix-network-token',
  'YFI': 'yearn-finance',
  'SUSHI': 'sushi',
  'CRV': 'curve-dao-token',
  '1INCH': '1inch',
  'BAT': 'basic-attention-token',
  'ZRX': '0x',
  'REN': 'republic-protocol',
  'KNC': 'kyber-network-crystal',
  'LRC': 'loopring',
  'BAL': 'balancer',
  'UMA': 'uma',
  'STORJ': 'storj',
  'MANA': 'decentraland',
  'SAND': 'the-sandbox',
  'AXS': 'axie-infinity',
  'ENJ': 'enjin-coin',
  'CHZ': 'chiliz',
  'HOT': 'holo',
  'ANKR': 'ankr',
  'CELR': 'celer-network',
  'BTT': 'bittorrent',
  'WIN': 'wink',
  'DENT': 'dent',
  'TFUEL': 'theta-fuel',
  'SC': 'siacoin',
  'ZIL': 'zilliqa',
  'ICX': 'icon',
  'ONT': 'ontology',
  'QTUM': 'qtum',
  'ZEC': 'zcash',
  'DASH': 'dash',
  'DCR': 'decred',
  'XVG': 'verge',
  'NANO': 'nano',
  'RVN': 'ravencoin',
  'HBAR': 'hedera-hashgraph',
  'EGLD': 'elrond-erd-2',
  'FLOW': 'flow',
  'NEAR': 'near',
  'LUNA': 'terra-luna-2',
  'LUNAC': 'terra-luna-classic',
  'USTC': 'terrausd-classic',
  'SHIB': 'shiba-inu',
  'PEPE': 'pepe',
  'FLOKI': 'floki',
  'BONK': 'bonk',
  'WIF': 'dogwifhat',
  'POPCAT': 'popcat',
  'WLD': 'worldcoin-wld',
  'TIA': 'celestia',
  'SEI': 'sei-network',
  'INJ': 'injective-protocol',
  'SUI': 'sui',
  'APT': 'aptos',
  'OP': 'optimism',
  'ARB': 'arbitrum',
  'STRK': 'starknet',
  'MNT': 'mantle',
  'BASE': 'base',
  'ZKSYNC': 'zksync',
  'LINEA': 'linea',
  'MANTA': 'manta-network',
  'BLAST': 'blast',
  'MODE': 'mode',
  'SCROLL': 'scroll',
  'TAIKO': 'taiko',
};

interface CoinGeckoSimplePriceResponse {
  [coinId: string]: {
    usd: number;
    usd_24h_change?: number;
    last_updated_at?: number;
  };
}

export class CoinGeckoProvider implements QuoteProvider {
  readonly name = 'coingecko';

  supports(assetClass: AssetClass): boolean {
    return assetClass === 'crypto';
  }

  async fetchQuote(symbol: string, assetClass: AssetClass): Promise<QuoteResult | null> {
    if (!this.supports(assetClass)) {
      return null;
    }

    const coinId = SYMBOL_TO_COINGECKO_ID[symbol.toUpperCase()];
    if (!coinId) {
      // Try lowercase symbol as fallback
      const lowerSymbol = symbol.toLowerCase();
      const fallbackId = SYMBOL_TO_COINGECKO_ID[lowerSymbol.toUpperCase()];
      if (!fallbackId) {
        return null;
      }
    }

    const targetId = coinId ?? SYMBOL_TO_COINGECKO_ID[symbol.toLowerCase().toUpperCase()];
    if (!targetId) {
      return null;
    }

    const url = `${COINGECKO_BASE_URL}/simple/price?ids=${targetId}&vs_currencies=usd`;
    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('CoinGecko rate limit exceeded');
      }
      return null;
    }

    const data = await response.json() as CoinGeckoSimplePriceResponse;

    const coinData = data[targetId];
    if (!coinData || coinData.usd === undefined) {
      return null;
    }

    const priceCents = BigInt(Math.round(coinData.usd * 100));

    return {
      priceCents,
      currency: 'USD',
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
export const coingeckoProvider = new CoinGeckoProvider();