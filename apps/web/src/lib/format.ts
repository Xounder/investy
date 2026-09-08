/**
 * pt-BR money and number formatting utilities.
 * Money is always integer cents (ADR-004).
 */

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

/**
 * Format integer cents as BRL currency string.
 * @param cents - value in integer cents
 */
export function formatMoney(cents: number): string {
  return brlFormatter.format(cents / 100);
}

/**
 * Format a decimal ratio as pt-BR percentage string.
 * @param ratio - e.g. 0.1234 = 12.34%
 */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

/**
 * Format a plain number with pt-BR grouping.
 */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
