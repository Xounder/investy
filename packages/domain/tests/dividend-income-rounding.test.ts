import { describe, expect, it } from 'vitest';
import { EMPTY_HOLDING, processTransaction } from '../src/index.js';

describe('historically converted dividend income', () => {
  const dividend = { type: 'dividend' as const, date: '2026-01-01', qty: 3n,
    unitPriceCents: 1n, feeCents: 0n };

  it('accepts a positive native unit even when the rounded BRL aggregate is zero', () => {
    expect(processTransaction(EMPTY_HOLDING, { ...dividend, dividendIncomeCents: 0n }))
      .toMatchObject({ qty: 0n, costBasisCents: 0n, realizedPnlCents: 0n });
    expect(processTransaction(EMPTY_HOLDING, { ...dividend, dividendIncomeCents: 5n }).realizedPnlCents).toBe(5n);
  });

  it('rejects a negative override or a nonzero fee even with a valid aggregate', () => {
    expect(() => processTransaction(EMPTY_HOLDING, { ...dividend, dividendIncomeCents: -1n })).toThrow();
    expect(() => processTransaction(EMPTY_HOLDING, { ...dividend, feeCents: 1n, dividendIncomeCents: 5n })).toThrow();
  });
});
