/**
 * Asset catalog service.
 *
 * Provides catalog search, trending assets, asset detail, and seeding.
 * All assets are stored in the `assets` table with provider keys for quote fetching.
 */
import { getDb } from '../../db/client.js';
import { assets } from '../../db/schema.js';
import { eq, ilike, or, and, inArray, sql, ne } from 'drizzle-orm';
import type { AssetTable, NewAsset } from '../../db/schema.js';
import type { AssetClass } from '@investy/domain';
import { getCachedQuote } from '../market-data/cache.js';
import { getUserOverride } from '../market-data/overrides.js';
import { getBrlPrice } from '../market-data/fx.js';

/** Page size for catalog search. */
export const CATALOG_PAGE_SIZE = 20;

/**
 * Searches assets with pagination and filters.
 */
export interface AssetSearchParams {
  search?: string;
  class?: AssetClass;
  currency?: string;
  page?: number;
  pageSize?: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function searchAssets(
  params: AssetSearchParams,
): Promise<PagedResult<AssetTable>> {
  const {
    search,
    class: assetClass,
    currency,
    page = 1,
    pageSize = CATALOG_PAGE_SIZE,
  } = params;

  const db = getDb();
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions = [];

  if (search) {
    const searchTerm = `%${search}%`;
    conditions.push(
      or(
        ilike(assets.symbol, searchTerm),
        ilike(assets.name, searchTerm),
        ilike(assets.isin, searchTerm),
      ),
    );
  }

  if (assetClass) {
    conditions.push(eq(assets.class, assetClass));
  }

  if (currency) {
    conditions.push(eq(assets.currency, currency.toUpperCase()));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(assets)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  // Get paginated results
  const items = await db
    .select()
    .from(assets)
    .where(whereClause)
    .orderBy(assets.symbol)
    .limit(pageSize)
    .offset(offset);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Gets trending assets ("mais buscados").
 * Returns a curated default list for now; can be enhanced with search frequency tracking.
 */
export async function getTrendingAssets(limit = 10): Promise<AssetTable[]> {
  const db = getDb();

  // Curated list of top Brazilian assets (major tickers)
  const trendingSymbols = [
    'PETR4', 'VALE3', 'ITUB4', 'BBDC4', 'ABEV3', // Top stocks
    'HGLG11', 'XPLG11', 'KNRI11', 'VISC11', 'MXRF11', // Top FIIs
    'BOVA11', 'IVVB11', 'SMAL11', 'FIXA11', // Top ETFs
    'AAPL34', 'GOGL34', 'MSFT34', 'TSLA34', // Top BDRs
    'BTC', 'ETH', // Top crypto
  ];

  const results = await db
    .select()
    .from(assets)
    .where(inArray(assets.symbol, trendingSymbols))
    .orderBy(
      // Custom order to match trendingSymbols priority
      sql`CASE ${assets.symbol} ${trendingSymbols.map((s, i) => `WHEN ${s} THEN ${i}`).join(' ')} END`
    )
    .limit(limit);

  // If not enough seeded assets, fill with any assets
  if (results.length < limit) {
    const more = await db
      .select()
      .from(assets)
      .where(and(...trendingSymbols.map(s => ne(assets.symbol, s)))) // Not in trending
      .limit(limit - results.length);
    results.push(...more);
  }

  return results;
}

/**
 * Gets asset detail with last quote and user override.
 */
export interface AssetDetail {
  asset: AssetTable;
  lastQuote: {
    priceCents: bigint;
    currency: string;
    source: string;
    fetchedAt: Date;
    isStale: boolean;
    priceCentsBRL: bigint | null;
    fxRateUsed: number | null;
    fxUnavailable: boolean;
  } | null;
  userOverride: {
    priceCents: bigint;
    currency: string;
    createdAt: Date;
  } | null;
}

export async function getAssetDetail(
  symbol: string,
  userId?: string,
): Promise<AssetDetail | null> {
  const db = getDb();

  const [asset] = await db
    .select()
    .from(assets)
    .where(eq(assets.symbol, symbol.toUpperCase()))
    .limit(1);

  if (!asset) {
    return null;
  }

  // Get last quote
  const cached = await getCachedQuote(asset.id);
  let lastQuote = null;

  if (cached) {
    const brlPrice = await getBrlPrice(
      asset,
      cached.quote.priceCents,
      cached.quote.currency,
      cached.isStale,
    );

    lastQuote = {
      priceCents: cached.quote.priceCents,
      currency: cached.quote.currency,
      source: cached.quote.source,
      fetchedAt: cached.quote.fetchedAt,
      isStale: cached.isStale,
      priceCentsBRL: brlPrice?.priceCentsBRL ?? null,
      fxRateUsed: brlPrice?.fxRateUsed ?? null,
      fxUnavailable: brlPrice?.fxUnavailable ?? false,
    };
  }

  // Get user override if authenticated
  let userOverride = null;
  if (userId) {
    const override = await getUserOverride(userId, asset.id);
    if (override) {
      userOverride = {
        priceCents: override.priceCents,
        currency: override.currency,
        createdAt: override.createdAt,
      };
    }
  }

  return {
    asset,
    lastQuote,
    userOverride,
  };
}

/**
 * Creates or updates an asset (idempotent upsert).
 */
export async function upsertAsset(data: NewAsset): Promise<AssetTable> {
  const db = getDb();

  const [asset] = await db
    .insert(assets)
    .values(data)
    .onConflictDoUpdate({
      target: assets.symbol,
      set: {
        name: data.name,
        class: data.class,
        sector: data.sector,
        currency: data.currency,
        providerKey: data.providerKey,
        isin: data.isin,
      },
    })
    .returning();

  if (!asset) {
    throw new Error('Failed to upsert asset');
  }

  return asset;
}

/**
 * Seeds the asset catalog with common Brazilian assets.
 * Idempotent — safe to run multiple times.
 */
export async function seedAssetCatalog(): Promise<number> {
  const seedAssets: NewAsset[] = [
    // Top Ações (Stocks)
    { id: crypto.randomUUID(), symbol: 'PETR4', name: 'Petróleo Brasileiro SA - Petrobras PN', class: 'acao', sector: 'Petróleo e Gás', currency: 'BRL', providerKey: 'PETR4', isin: 'BRPETRACNPR6' },
    { id: crypto.randomUUID(), symbol: 'VALE3', name: 'Vale SA ON', class: 'acao', sector: 'Mineração', currency: 'BRL', providerKey: 'VALE3', isin: 'BRVALEACNOR0' },
    { id: crypto.randomUUID(), symbol: 'ITUB4', name: 'Itaú Unibanco Holding SA PN', class: 'acao', sector: 'Bancos', currency: 'BRL', providerKey: 'ITUB4', isin: 'BRITUBACNPR1' },
    { id: crypto.randomUUID(), symbol: 'BBDC4', name: 'Banco Bradesco SA PN', class: 'acao', sector: 'Bancos', currency: 'BRL', providerKey: 'BBDC4', isin: 'BRBBDCACNPR8' },
    { id: crypto.randomUUID(), symbol: 'ABEV3', name: 'Ambev SA ON', class: 'acao', sector: 'Bebidas', currency: 'BRL', providerKey: 'ABEV3', isin: 'BRABEVACNOR1' },
    { id: crypto.randomUUID(), symbol: 'WEGE3', name: 'WEG SA ON', class: 'acao', sector: 'Máquinas e Equipamentos', currency: 'BRL', providerKey: 'WEGE3', isin: 'BRWEGEACNOR0' },
    { id: crypto.randomUUID(), symbol: 'RENT3', name: 'Localiza Rent a Car SA ON', class: 'acao', sector: 'Locação de Veículos', currency: 'BRL', providerKey: 'RENT3', isin: 'BRRENTACNOR4' },
    { id: crypto.randomUUID(), symbol: 'BBAS3', name: 'Banco do Brasil SA ON', class: 'acao', sector: 'Bancos', currency: 'BRL', providerKey: 'BBAS3', isin: 'BRBBASACNOR3' },
    { id: crypto.randomUUID(), symbol: 'MGLU3', name: 'Magazine Luiza SA ON', class: 'acao', sector: 'Varejo', currency: 'BRL', providerKey: 'MGLU3', isin: 'BRMGLUACNOR2' },
    { id: crypto.randomUUID(), symbol: 'SUZB3', name: 'Suzano SA ON', class: 'acao', sector: 'Papel e Celulose', currency: 'BRL', providerKey: 'SUZB3', isin: 'BRSUZBACNOR0' },
    { id: crypto.randomUUID(), symbol: 'RADL3', name: 'Raia Drogasil SA ON', class: 'acao', sector: 'Comércio e Distribuição', currency: 'BRL', providerKey: 'RADL3', isin: 'BRRADLACNOR0' },
    { id: crypto.randomUUID(), symbol: 'HAPV3', name: 'Hapvida Participações SA ON', class: 'acao', sector: 'Saúde', currency: 'BRL', providerKey: 'HAPV3', isin: 'BRHAPVACNOR4' },
    { id: crypto.randomUUID(), symbol: 'CCRO3', name: 'CCR SA ON', class: 'acao', sector: 'Transporte e Logística', currency: 'BRL', providerKey: 'CCRO3', isin: 'BRCCROACNOR2' },
    { id: crypto.randomUUID(), symbol: 'LREN3', name: 'Lojas Renner SA ON', class: 'acao', sector: 'Varejo', currency: 'BRL', providerKey: 'LREN3', isin: 'BRLRENACNOR5' },
    { id: crypto.randomUUID(), symbol: 'EQTL3', name: 'Equatorial Energia SA ON', class: 'acao', sector: 'Energia Elétrica', currency: 'BRL', providerKey: 'EQTL3', isin: 'BREQTLACNOR0' },

    // Top FIIs (Real Estate Funds)
    { id: crypto.randomUUID(), symbol: 'HGLG11', name: 'CSHG Logística FII', class: 'fii', sector: 'Logística', currency: 'BRL', providerKey: 'HGLG11', isin: 'BRHGLGCT0003' },
    { id: crypto.randomUUID(), symbol: 'XPLG11', name: 'XP Logística FII', class: 'fii', sector: 'Logística', currency: 'BRL', providerKey: 'XPLG11', isin: 'BRXPLGCT0007' },
    { id: crypto.randomUUID(), symbol: 'KNRI11', name: 'Kinea Renda Imobiliária FII', class: 'fii', sector: 'Renda Imobiliária', currency: 'BRL', providerKey: 'KNRI11', isin: 'BRKNRICT0005' },
    { id: crypto.randomUUID(), symbol: 'VISC11', name: 'Vinci Shopping Centers FII', class: 'fii', sector: 'Shoppings', currency: 'BRL', providerKey: 'VISC11', isin: 'BRVISCCT0009' },
    { id: crypto.randomUUID(), symbol: 'MXRF11', name: 'Maxi Renda FII', class: 'fii', sector: 'Renda Imobiliária', currency: 'BRL', providerKey: 'MXRF11', isin: 'BRMXRFCT0004' },
    { id: crypto.randomUUID(), symbol: 'VILG11', name: 'Vinci Logística FII', class: 'fii', sector: 'Logística', currency: 'BRL', providerKey: 'VILG11', isin: 'BRVILGCT0002' },
    { id: crypto.randomUUID(), symbol: 'RECT11', name: 'REC Renda Imobiliária FII', class: 'fii', sector: 'Renda Imobiliária', currency: 'BRL', providerKey: 'RECT11', isin: 'BRRECTCT0001' },
    { id: crypto.randomUUID(), symbol: 'XPML11', name: 'XP Malls FII', class: 'fii', sector: 'Shoppings', currency: 'BRL', providerKey: 'XPML11', isin: 'BRXPMLCT0006' },
    { id: crypto.randomUUID(), symbol: 'HGBS11', name: 'Hedge Brasil Shopping FII', class: 'fii', sector: 'Shoppings', currency: 'BRL', providerKey: 'HGBS11', isin: 'BRHGBSCT0008' },
    { id: crypto.randomUUID(), symbol: 'IRDM11', name: 'Iridium Recebíveis Imobiliários FII', class: 'fii', sector: 'Recebíveis', currency: 'BRL', providerKey: 'IRDM11', isin: 'BRIRDMCT0003' },

    // Top ETFs (Brazilian)
    { id: crypto.randomUUID(), symbol: 'BOVA11', name: 'iShares Ibovespa Fundo de Investimento', class: 'etf', sector: 'Índice', currency: 'BRL', providerKey: 'BOVA11', isin: 'BRBOVACTF006' },
    { id: crypto.randomUUID(), symbol: 'IVVB11', name: 'iShares S&P 500 Fundo de Investimento', class: 'etf', sector: 'Índice Internacional', currency: 'BRL', providerKey: 'IVVB11', isin: 'BRIVVBCTF003' },
    { id: crypto.randomUUID(), symbol: 'SMAL11', name: 'iShares Small Cap Fundo de Investimento', class: 'etf', sector: 'Small Caps', currency: 'BRL', providerKey: 'SMAL11', isin: 'BRSMALCTF005' },
    { id: crypto.randomUUID(), symbol: 'FIXA11', name: 'iShares IMA-B 5 Fundo de Investimento', class: 'etf', sector: 'Renda Fixa', currency: 'BRL', providerKey: 'FIXA11', isin: 'BRFIXACTF007' },
    { id: crypto.randomUUID(), symbol: 'IMAB11', name: 'iShares IMA-B Fundo de Investimento', class: 'etf', sector: 'Renda Fixa', currency: 'BRL', providerKey: 'IMAB11', isin: 'BRIMABCTF004' },
    { id: crypto.randomUUID(), symbol: 'XBOV11', name: 'Xtrackers Ibovespa UCITS ETF', class: 'etf', sector: 'Índice', currency: 'BRL', providerKey: 'XBOV11', isin: 'BRXBOVCTF002' },

    // Top BDRs (Brazilian Depositary Receipts) - quoted in BRL
    { id: crypto.randomUUID(), symbol: 'AAPL34', name: 'Apple Inc. BDR N1', class: 'bdr', sector: 'Tecnologia', currency: 'BRL', providerKey: 'AAPL34', isin: 'BRAAPLCTF008' },
    { id: crypto.randomUUID(), symbol: 'GOGL34', name: 'Alphabet Inc. (Google) BDR N1', class: 'bdr', sector: 'Tecnologia', currency: 'BRL', providerKey: 'GOGL34', isin: 'BRGOGLCTF001' },
    { id: crypto.randomUUID(), symbol: 'MSFT34', name: 'Microsoft Corporation BDR N1', class: 'bdr', sector: 'Tecnologia', currency: 'BRL', providerKey: 'MSFT34', isin: 'BRMSFTCTF002' },
    { id: crypto.randomUUID(), symbol: 'TSLA34', name: 'Tesla Inc. BDR N1', class: 'bdr', sector: 'Automóveis', currency: 'BRL', providerKey: 'TSLA34', isin: 'BRTSLACTF003' },
    { id: crypto.randomUUID(), symbol: 'AMZO34', name: 'Amazon.com Inc. BDR N1', class: 'bdr', sector: 'Comércio Eletrônico', currency: 'BRL', providerKey: 'AMZO34', isin: 'BRAMZOCTF004' },
    { id: crypto.randomUUID(), symbol: 'NVDC34', name: 'NVIDIA Corporation BDR N1', class: 'bdr', sector: 'Semicondutores', currency: 'BRL', providerKey: 'NVDC34', isin: 'BRNVDCCTF005' },
    { id: crypto.randomUUID(), symbol: 'META34', name: 'Meta Platforms Inc. BDR N1', class: 'bdr', sector: 'Tecnologia', currency: 'BRL', providerKey: 'META34', isin: 'BRMETACTF006' },
    { id: crypto.randomUUID(), symbol: 'DISN34', name: 'The Walt Disney Company BDR N1', class: 'bdr', sector: 'Entretenimento', currency: 'BRL', providerKey: 'DISN34', isin: 'BRDISNCTF007' },

    // Top Crypto (brapi provides these)
    { id: crypto.randomUUID(), symbol: 'BTC', name: 'Bitcoin', class: 'crypto', sector: 'Criptomoeda', currency: 'BRL', providerKey: 'BTC', isin: null },
    { id: crypto.randomUUID(), symbol: 'ETH', name: 'Ethereum', class: 'crypto', sector: 'Criptomoeda', currency: 'BRL', providerKey: 'ETH', isin: null },
    { id: crypto.randomUUID(), symbol: 'USDT', name: 'Tether USD', class: 'crypto', sector: 'Stablecoin', currency: 'BRL', providerKey: 'USDT', isin: null },
    { id: crypto.randomUUID(), symbol: 'SOL', name: 'Solana', class: 'crypto', sector: 'Criptomoeda', currency: 'BRL', providerKey: 'SOL', isin: null },

    // Benchmarks / Indicators
    { id: crypto.randomUUID(), symbol: 'IBOV', name: 'Índice Bovespa', class: 'indice', sector: 'Índice', currency: 'BRL', providerKey: 'IBOV', isin: null },
    { id: crypto.randomUUID(), symbol: 'IFIX', name: 'Índice de Fundos Imobiliários', class: 'indice', sector: 'Índice', currency: 'BRL', providerKey: 'IFIX', isin: null },
    { id: crypto.randomUUID(), symbol: 'CDI', name: 'Certificado de Depósito Interbancário', class: 'indice', sector: 'Taxa', currency: 'BRL', providerKey: 'CDI', isin: null },
    { id: crypto.randomUUID(), symbol: 'SELIC', name: 'Taxa Selic', class: 'indice', sector: 'Taxa', currency: 'BRL', providerKey: 'SELIC', isin: null },
    { id: crypto.randomUUID(), symbol: 'IPCA', name: 'Índice de Preços ao Consumidor Amplo', class: 'indice', sector: 'Inflação', currency: 'BRL', providerKey: 'IPCA', isin: null },
    { id: crypto.randomUUID(), symbol: 'USDBRL', name: 'Dólar Americano / Real Brasileiro', class: 'indice', sector: 'Câmbio', currency: 'BRL', providerKey: 'USDBRL', isin: null },
  ];

  let count = 0;
  for (const asset of seedAssets) {
    try {
      await upsertAsset(asset);
      count++;
    } catch (error) {
      console.warn(`Failed to seed asset ${asset.symbol}:`, error);
    }
  }

  return count;
}