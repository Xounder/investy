import { api } from './api';

export interface Portfolio { id: string; name: string; isDefault: boolean }
export interface Account { id: string; name: string; portfolioId: string }
export interface Asset { id: string; symbol: string; name: string; class: string; currency: string }
export interface Holding {
  id: string; accountId: string; assetId: string; symbol: string; assetName: string;
  assetClass: string; assetCurrency: string; qty: string; avgPriceCents: string;
  costBasisCents: string; priceCents: string | null; marketValueCentsBRL: string | null;
  unrealizedPnlCentsBRL: string | null; dayChangePercent: number | null; isStale: boolean;
}
export interface JournalEvent {
  id: string; date: string; type: string; assetId: string; accountId: string;
  qty: string; unitPriceCents: string; feeCents: string; notes: string | null;
  currency?: string; fxRateToBRL?: string | null; factor?: number | null; amortRateCents?: string | null;
}
export interface AssetDetail {
  asset: Asset;
  lastQuote: { priceCents: string; isStale: boolean; currency: string; source?: string; priceCentsBRL?: string | null; fxUnavailable?: boolean } | null;
  userOverride?: { priceCents: string; currency: string; createdAt: string } | null;
}
export interface PositionDetail {
  summary: { qty: string; priceCentsBRL: string | null; dayChangePercent: number | null };
  quote: { isStale: boolean } | null;
  lots: { accountId: string; date: string | null; qty: string; costBasisCents: string }[];
  events: JournalEvent[];
}
const root = '/v1';
export const journalApi = {
  portfolios: async () => (await api.get<{ portfolios: Portfolio[] }>(`${root}/portfolios`)).portfolios,
  accounts: async (portfolioId: string) => (await api.get<{ accounts: Account[] }>(`${root}/accounts?portfolioId=${encodeURIComponent(portfolioId)}`)).accounts,
  assets: (search: string, page = 1, pageSize = 20) => api.get<{ items: Asset[]; totalPages: number }>(`${root}/assets?search=${encodeURIComponent(search)}&page=${page}&pageSize=${pageSize}`),
  catalog: async () => {
    const first = await journalApi.assets('', 1, 100);
    const rest = await Promise.all(Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) => journalApi.assets('', i + 2, 100)));
    return [first, ...rest].flatMap((page) => page.items);
  },
  asset: (symbol: string) => api.get<AssetDetail>(`${root}/assets/${encodeURIComponent(symbol)}`),
  holdings: async (portfolioId: string | null) => (await api.get<{ holdings: Holding[] }>(`${root}/holdings${portfolioId ? `?portfolioId=${encodeURIComponent(portfolioId)}` : ''}`)).holdings,
  position: (assetId: string) => api.get<PositionDetail>(`${root}/holdings/${encodeURIComponent(assetId)}`),
  transactions: (params: URLSearchParams) => api.get<{ items: JournalEvent[]; page: number; hasMore: boolean }>(`${root}/transactions?${params}`),
  create: (body: Record<string, unknown>) => api.post<JournalEvent>(`${root}/transactions`, body),
};

export function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error && error.status === 401) return 'Sessão expirada. Faça login novamente.';
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && !/^Erro \d+$/.test(error.message)) return error.message;
  if (error && typeof error === 'object' && 'status' in error && error.status === 400) return 'Dados inválidos. Confira os campos e tente novamente.';
  return 'Não foi possível conectar. Verifique sua conexão e tente novamente.';
}

export function isUnauthorized(error: unknown) {
  return !!error && typeof error === 'object' && 'status' in error && error.status === 401;
}
