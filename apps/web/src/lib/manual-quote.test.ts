import { describe, expect, it } from 'vitest';
import { parseManualPrice } from './manual-quote';

describe('native-currency manual price input', () => {
  it('converts pt-BR decimals and grouped values into exact JSON-safe cents', () => {
    expect(parseManualPrice('0,01')).toBe(1);
    expect(parseManualPrice('1.234.567,89')).toBe(123456789);
    expect(parseManualPrice('90071992547409,91')).toBe(Number.MAX_SAFE_INTEGER);
  });
  it.each(['0', '0,00', '-1,00', '1,001', '1.23', '1.23,45', '1e3', '90071992547409,92', ''])('rejects invalid or unrepresentable price %s', (value) => {
    expect(parseManualPrice(value)).toBeNull();
  });
});
