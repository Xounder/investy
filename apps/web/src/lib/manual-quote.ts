import { api } from './api';

// The PATCH contract accepts a JSON number; keep every cent exactly representable.
export function parseManualPrice(input: string): number | null {
  const text = input.trim();
  if (!/^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return null;
  const [whole, fractional = ''] = text.split(',');
  const cents = BigInt(whole!.replaceAll('.', '')) * 100n + BigInt(fractional.padEnd(2, '0'));
  return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export const manualQuoteApi = {
  save: (symbol: string, priceCents: number, currency: string) =>
    api.patch(`/v1/assets/${encodeURIComponent(symbol)}/override`, { priceCents, currency }),
  clear: (symbol: string) => api.delete(`/v1/assets/${encodeURIComponent(symbol)}/override`),
};
