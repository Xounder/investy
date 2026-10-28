import { api, apiFetch } from './api';

export interface Profile { id: string; name: string | null; email: string }
export interface Portfolio { id: string; name: string; isDefault: boolean }
export interface Broker { id: string; name: string; code: string | null; url: string | null; isSeeded: boolean }
export interface Account { id: string; portfolioId: string; brokerId: string; name: string; accountNumber: string | null }
export interface BackupStatus {
  lastBackup: { verifiedAt: string | null; bytes: string | null; sha256: string | null } | null;
  status: 'not_configured' | 'running' | 'interrupted' | 'failed' | 'verified' | 'unavailable';
  workerStatus: 'not_configured' | 'running' | 'interrupted' | 'failed' | 'verified' | 'unavailable';
  reason: 'artifact_missing_or_corrupt' | null;
  retentionNote: string;
}
export interface PriceOverride { assetId: string; symbol: string; assetName: string; priceCents: string; currency: string; createdAt: string }

const root = '/v1';
export const settingsApi = {
  profile: () => api.get<Profile>(`${root}/auth/me`),
  updateProfile: (body: { name: string; email: string }) => api.patch<Profile>(`${root}/auth/me`, body),
  portfolios: async () => (await api.get<{ portfolios: Portfolio[] }>(`${root}/portfolios`)).portfolios,
  createPortfolio: (name: string) => api.post<Portfolio>(`${root}/portfolios`, { name }),
  updatePortfolio: (id: string, body: { name?: string; isDefault?: boolean }) => api.patch<Portfolio>(`${root}/portfolios/${encodeURIComponent(id)}`, body),
  deletePortfolio: (id: string) => api.delete<void>(`${root}/portfolios/${encodeURIComponent(id)}`),
  brokers: async () => (await api.get<{ brokers: Broker[] }>(`${root}/brokers`)).brokers,
  createBroker: (body: { name: string; code?: string; url?: string }) => api.post<Broker>(`${root}/brokers`, body),
  accounts: async (portfolioId: string) => (await api.get<{ accounts: Account[] }>(`${root}/accounts?portfolioId=${encodeURIComponent(portfolioId)}`)).accounts,
  createAccount: (body: { portfolioId: string; brokerId: string; name: string; accountNumber: string | null }) => api.post<Account>(`${root}/accounts`, body),
  updateAccount: (id: string, body: { name: string; accountNumber: string | null }) => api.patch<Account>(`${root}/accounts/${encodeURIComponent(id)}`, body),
  deleteAccount: (id: string) => api.delete<void>(`${root}/accounts/${encodeURIComponent(id)}`),
  backups: () => api.get<BackupStatus>(`${root}/settings/backups`),
  overrides: async () => (await api.get<{ overrides: PriceOverride[] }>(`${root}/settings/overrides`)).overrides,
  clearOverride: (symbol: string) => api.delete<{ ok: boolean }>(`${root}/assets/${encodeURIComponent(symbol)}/override`),
  erase: (email: string, password: string) => apiFetch<void>(`${root}/settings/account`, { method: 'DELETE', body: JSON.stringify({ email, password }) }),
};

// Binary exports must not pass through apiFetch, which always parses JSON.
export async function downloadExport(format: 'json' | 'csv'): Promise<void> {
  const response = await fetch(`/api/v1/export?format=${format}`, { method: 'POST', credentials: 'include' });
  if (!response.ok) {
    let body: { error?: { message?: string }; message?: string } | undefined;
    try { body = await response.json(); } catch { /* Non-JSON server error. */ }
    throw { status: response.status, message: body?.error?.message ?? body?.message ?? `Erro ${response.status}` };
  }
  const contentType = response.headers.get('Content-Type') ?? '';
  const expected = format === 'json' ? 'application/json' : 'application/zip';
  if (!contentType.toLowerCase().includes(expected)) throw new Error('Formato de exportação inesperado.');
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `investy-export.${format === 'json' ? 'json' : 'zip'}`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
