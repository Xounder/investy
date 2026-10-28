import { describe, expect, it } from 'vitest';
import { EMPTY_HOLDING, processTransaction } from '../src/index.js';

describe('historical FX journal totals', () => {
  const base = { date: '2026-01-10', qty: 3n, unitPriceCents: 1n, feeCents: 0n };
  it('accepts aggregate BRL cents for JCP without early per-unit rounding', () => {
    expect(processTransaction(EMPTY_HOLDING, { ...base, type: 'jcp', dividendIncomeCents: 5n })
      .realizedPnlCents).toBe(5n);
  });
  it('applies rounded aggregate amortization to basis before a sale', () => {
    const acquired = processTransaction(EMPTY_HOLDING, { ...base, type: 'buy', unitPriceCents: 100n });
    const returned = processTransaction(acquired, { ...base, type: 'amortizacao', rate: 1, amortizationCents: 5n });
    expect(returned).toMatchObject({ qty: 3n, costBasisCents: 295n, realizedPnlCents: 0n });
    expect(processTransaction(returned, { ...base, type: 'sell', unitPriceCents: 100n }).realizedPnlCents).toBe(5n);
  });
});
