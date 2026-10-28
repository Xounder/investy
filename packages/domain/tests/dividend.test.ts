import { describe, expect, it } from 'vitest';
import { EMPTY_HOLDING, JournalError, processTransaction, type JournalEvent } from '../src/index.js';

const event = (type: JournalEvent['type'], qty: bigint, unitPriceCents: bigint): JournalEvent => ({
  type, date: '2026-01-01T00:00:00.000Z', qty, unitPriceCents, feeCents: 0n,
});

describe('dividend journal replay', () => {
  it('keeps dividend and JCP distinct while preserving acquisition basis and shares', () => {
    const bought = processTransaction(EMPTY_HOLDING, event('buy', 4n, 100n));
    const dividend = processTransaction(bought, event('dividend', 4n, 25n));
    expect(dividend).toEqual({ qty: 4n, costBasisCents: 400n, avgPriceCents: 100n, realizedPnlCents: 100n });
    expect(processTransaction(dividend, event('jcp', 4n, 10n)).realizedPnlCents).toBe(140n);
    const sold = processTransaction(dividend, event('sell', 2n, 150n));
    expect(sold).toEqual({ qty: 2n, costBasisCents: 200n, avgPriceCents: 100n, realizedPnlCents: 200n });
  });

  it('rejects zero/negative dividend price, zero quantity, and fees', () => {
    for (const invalid of [event('dividend', 0n, 10n), event('dividend', 1n, 0n),
      event('dividend', 1n, -1n), { ...event('dividend', 1n, 10n), feeCents: 1n }]) {
      expect(() => processTransaction(EMPTY_HOLDING, invalid)).toThrow(JournalError);
    }
  });
});
