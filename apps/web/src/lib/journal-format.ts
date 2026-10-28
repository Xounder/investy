const decimal = new Intl.NumberFormat('pt-BR');

export function money(cents: string | null | undefined, currency = 'BRL') {
  if (cents == null) return '—';
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  const symbol = currency === 'USD' ? 'US$' : 'R$';
  return `${value < 0n ? '−' : ''}${symbol} ${decimal.format(whole)},${fraction}`;
}

export function quantity(value: string) { return decimal.format(BigInt(value)); }
export function signedMoney(value: string | null) {
  if (value == null) return '—';
  return `${BigInt(value) > 0n ? '+' : ''}${money(value)}`;
}
export function pnlTone(value: string | null) {
  if (value == null) return '';
  return BigInt(value) > 0n ? 'text-green-700' : BigInt(value) < 0n ? 'text-red-700' : 'text-gray-700';
}
const dayPercent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function dailyChange(value: number | null) {
  if (value == null) return '—';
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${dayPercent.format(Math.abs(value))}%`;
}
export function dailyChangeTone(value: number | null) {
  return value == null ? '' : value > 0 ? 'text-green-700' : value < 0 ? 'text-red-700' : 'text-gray-700';
}
export function percent(part: string | null, total: string) {
  if (part == null) return '—';
  const denominator = BigInt(total);
  if (!denominator) return '0%';
  const scaled = BigInt(part) * 10000n / denominator;
  return `${scaled > 0n ? '+' : ''}${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(scaled) / 100)}%`;
}
export function dateLabel(date: string) { return new Date(date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); }
export const typeLabels: Record<string, string> = {
  buy: 'Compra', sell: 'Venda', dividend: 'Dividendo', jcp: 'JCP', amortizacao: 'Amortização',
  split: 'Desdobramento', adjustment: 'Ajuste', bonificacao: 'Bonificação', opening: 'Abertura',
};

// Parse decimal currency without converting fractional cents through floating point.
export function toCents(input: string): string | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return cents <= 9223372036854775807n ? String(cents) : null;
}
export function toFxMicro(input: string): string | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const result = BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  return result > 0n && result <= 9223372036854775807n ? String(result) : null;
}
