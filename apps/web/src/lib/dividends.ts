import { api } from './api';

export type DividendKind = 'dividend' | 'jcp' | 'rendimento' | 'amortizacao';
export type DividendStatus = 'expected' | 'confirmed' | 'paid';
export interface DividendItem {
  id: string; portfolioId: string; assetId: string; symbol: string | null;
  assetName: string | null; assetClass: string | null; kind: DividendKind;
  category: 'income' | 'return_of_capital'; exDate: string; paymentDate: string | null;
  rateCentsPerUnit: string; currency: string; eligibleQty: string;
  nativeAmountCents: string; amountCurrency: string; amountCents: string; amountCentsBRL: string | null;
  status: DividendStatus; source: 'manual' | 'provider'; reconciliationRequired: boolean;
}
export interface FiiProjection {
  assetId: string; nextExDate: string; cadence: 'monthly' | 'irregular'; confidence: 'high' | 'low';
}
export interface DividendAgenda { items: DividendItem[]; projections: FiiProjection[] }
export interface IncomeHistory {
  year: number; month: number | null; totalCents: string; totalsIncomplete: boolean;
  months: { year: number; month: number; totalCents: string; totalsIncomplete: boolean; items: DividendItem[] }[];
}
export interface CreateDividend {
  portfolioId: string; assetId: string; kind: DividendKind;
  exDate: string; paymentDate?: string; rateCentsPerUnit: string;
}

const root = '/v1/dividends';
export const dividendsApi = {
  agenda: (from: string, to: string) => api.get<DividendAgenda>(`${root}/agenda?${new URLSearchParams({ from, to })}`),
  history: (year: number, month?: number) => api.get<IncomeHistory>(`${root}/history?${new URLSearchParams({ year: String(year), ...(month ? { month: String(month) } : {}) })}`),
  create: (body: CreateDividend) => api.post<DividendItem>(root, body),
  update: (id: string, body: { status?: 'confirmed' | 'paid'; paymentDate?: string; fxRateToBRL?: string }) => api.patch<DividendItem>(`${root}/${encodeURIComponent(id)}`, body),
};

export const kindLabels: Record<DividendKind, string> = {
  dividend: 'Dividendo', jcp: 'JCP', rendimento: 'Rendimento', amortizacao: 'Amortização (devolução de capital)',
};
