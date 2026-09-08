import { describe, expect, it } from 'vitest';

import { convertToBRL, makeFxRate } from '../src/fx.js';
import {
  createJournalEngine,
  EMPTY_HOLDING,
  JournalError,
  processTransaction,
} from '../src/journal-engine.js';
import {
  add,
  compare,
  divide,
  format,
  fromCents,
  moneyCents,
  multiply,
  subtract,
  toCents,
  ZERO_CENTS,
} from '../src/money.js';
import { allocate } from '../src/rateio.js';
import type { JournalEvent } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buyEvent(qty: number, price: number, fee = 0): JournalEvent {
  return {
    type: 'buy',
    date: '2026-01-01',
    qty: BigInt(qty),
    unitPriceCents: BigInt(price),
    feeCents: BigInt(fee),
  };
}

function sellEvent(qty: number, price: number, fee = 0): JournalEvent {
  return {
    type: 'sell',
    date: '2026-01-02',
    qty: BigInt(qty),
    unitPriceCents: BigInt(price),
    feeCents: BigInt(fee),
  };
}

// ===========================================================================
// money
// ===========================================================================

describe('money', () => {
  it('converts decimal values into integer cents', () => {
    expect(toCents(10.5)).toBe(1050n);
    expect(toCents(0.01)).toBe(1n);
    expect(toCents(0.004)).toBe(0n); // rounds down
    expect(toCents(0.005)).toBe(1n); // rounds up
  });

  it('creates MoneyCents from integers and bigints', () => {
    expect(moneyCents(1050)).toBe(1050n);
    expect(moneyCents(1050n)).toBe(1050n);
    expect(moneyCents(3.7)).toBe(3n); // truncates
  });

  it('converts cents back to decimal', () => {
    expect(fromCents(1050n)).toBe(10.5);
    expect(fromCents(1n)).toBe(0.01);
  });

  it('adds without floating-point drift', () => {
    expect(add(1n, 2n)).toBe(3n);
    expect(add(ZERO_CENTS, ZERO_CENTS)).toBe(ZERO_CENTS);
  });

  it('subtracts without floating-point drift', () => {
    expect(subtract(5n, 3n)).toBe(2n);
    expect(subtract(3n, 5n)).toBe(-2n);
  });

  it('multiplies by an integer factor', () => {
    expect(multiply(100n, 3n)).toBe(300n);
    expect(multiply(100n, 0n)).toBe(0n);
    expect(multiply(100n, -1n)).toBe(-100n);
  });

  it('divides with floor semantics', () => {
    expect(divide(10n, 3n)).toBe(3n);
    expect(divide(9n, 3n)).toBe(3n);
  });

  it('throws on division by zero', () => {
    expect(() => divide(10n, 0n)).toThrow('division by zero');
  });

  it('compares two values', () => {
    expect(compare(1n, 2n)).toBe(-1);
    expect(compare(2n, 2n)).toBe(0);
    expect(compare(3n, 2n)).toBe(1);
  });

  it('formats as pt-BR BRL currency', () => {
    const result = format(12345n);
    // Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    // produces "R$ 123,45" for 12345 cents.
    expect(result).toContain('123,45');
    expect(result).toContain('R$');
  });
});

// ===========================================================================
// fx
// ===========================================================================

describe('fx', () => {
  it('converts USD cents to BRL cents', () => {
    const rate = makeFxRate(5.2, new Date('2026-09-01T12:00:00Z'));
    expect(convertToBRL(1000n, rate)).toBe(5200n);
  });

  it('rounds to nearest cent', () => {
    const rate = makeFxRate(5.123, new Date('2026-09-01'));
    // 1000 * 5.123 = 5123.0 → 5123
    expect(convertToBRL(1000n, rate)).toBe(5123n);
  });

  it('handles zero USD amount', () => {
    const rate = makeFxRate(5.2, new Date('2026-09-01'));
    expect(convertToBRL(0n, rate)).toBe(0n);
  });

  it('rejects zero FX rate', () => {
    const rate = makeFxRate(0, new Date('2026-09-01'));
    expect(() => convertToBRL(1000n, rate)).toThrow('FX rate must be positive');
  });

  it('rejects negative FX rate', () => {
    const rate = makeFxRate(-5.2, new Date('2026-09-01'));
    expect(() => convertToBRL(1000n, rate)).toThrow('FX rate must be positive');
  });
});

// ===========================================================================
// rateio
// ===========================================================================

describe('rateio', () => {
  it('allocates proportionally with exact total (largest remainder)', () => {
    const allocations = allocate(10, [60, 40]);
    const total = allocations.reduce((s, a) => s + a.allocatedFeeCents, 0);
    expect(total).toBe(10);
    expect(allocations[0]?.allocatedFeeCents).toBe(6);
    expect(allocations[1]?.allocatedFeeCents).toBe(4);
  });

  it('spreads leftover cents deterministically', () => {
    const allocations = allocate(100, [1, 1, 1]);
    const total = allocations.reduce((s, a) => s + a.allocatedFeeCents, 0);
    expect(total).toBe(100);
    expect(
      allocations.every(
        (a) => a.allocatedFeeCents === 33 || a.allocatedFeeCents === 34,
      ),
    ).toBe(true);
  });

  it('returns no allocations for empty input', () => {
    expect(allocate(10, [])).toEqual([]);
  });

  it('single operation gets entire fee', () => {
    const allocations = allocate(100, [42]);
    expect(allocations).toEqual([{ operationIndex: 0, allocatedFeeCents: 100 }]);
  });

  it('returns zeros for zero total', () => {
    const allocations = allocate(0, [1, 2, 3]);
    expect(allocations.every((a) => a.allocatedFeeCents === 0)).toBe(true);
    const total = allocations.reduce((s, a) => s + a.allocatedFeeCents, 0);
    expect(total).toBe(0);
  });

  it('returns zeros for negative total', () => {
    const allocations = allocate(-5, [1, 2]);
    expect(allocations.every((a) => a.allocatedFeeCents === 0)).toBe(true);
  });

  it('handles large fee with many operations', () => {
    const weights = [1, 2, 3, 4, 5];
    const allocations = allocate(10000, weights);
    const total = allocations.reduce((s, a) => s + a.allocatedFeeCents, 0);
    expect(total).toBe(10000);
  });
});

// ===========================================================================
// journal-engine
// ===========================================================================

describe('journal-engine', () => {
  // --- buy ---------------------------------------------------------------

  describe('buy', () => {
    it('derives correct holding from a buy event', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 50));
      expect(h.qty).toBe(10n);
      expect(h.costBasisCents).toBe(10050n);
      expect(h.avgPriceCents).toBe(1005n);
      expect(h.realizedPnlCents).toBe(0n);
    });

    it('buy with zero fees', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      expect(h.qty).toBe(10n);
      expect(h.costBasisCents).toBe(10000n);
      expect(h.avgPriceCents).toBe(1000n);
    });

    it('accumulates across multiple buys', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000));
      h = processTransaction(h, buyEvent(5, 2000, 0));
      expect(h.qty).toBe(15n);
      // costBasis = 10*1000 + 5*2000 = 20000
      expect(h.costBasisCents).toBe(20000n);
      expect(h.avgPriceCents).toBe(1333n); // floor(20000/15)
    });

    it('rejects buy with zero quantity', () => {
      expect(() =>
        processTransaction(EMPTY_HOLDING, buyEvent(0, 1000)),
      ).toThrow(JournalError);
    });

    it('rejects buy with negative quantity', () => {
      expect(() =>
        processTransaction(EMPTY_HOLDING, {
          ...buyEvent(1, 1000),
          qty: -1n,
        }),
      ).toThrow(JournalError);
    });

    it('rejects buy with negative fee', () => {
      expect(() =>
        processTransaction(EMPTY_HOLDING, buyEvent(1, 1000, -1)),
      ).toThrow(JournalError);
    });
  });

  // --- sell --------------------------------------------------------------

  describe('sell', () => {
    it('computes realised P&L correctly', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      // avg = 1000, sell 5 at 1200 with fee 10
      h = processTransaction(h, sellEvent(5, 1200, 10));
      // costOfSold = 10000*5/10 = 5000
      // netProceeds = 5*1200 - 10 = 5990
      // realisedPnl = 5990 - 5000 = 990
      expect(h.qty).toBe(5n);
      expect(h.realizedPnlCents).toBe(990n);
      expect(h.costBasisCents).toBe(5000n);
    });

    it('sell entire position resets cost basis to 0', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      h = processTransaction(h, sellEvent(10, 1000, 0));
      expect(h.qty).toBe(0n);
      expect(h.costBasisCents).toBe(0n);
      expect(h.avgPriceCents).toBe(0n);
    });

    it('rejects sell more than held', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(5, 1000));
      expect(() => processTransaction(h, sellEvent(6, 1000))).toThrow(
        'Cannot sell more than held',
      );
    });

    it('rejects sell with zero quantity', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(5, 1000));
      expect(() => processTransaction(h, sellEvent(0, 1000))).toThrow(
        JournalError,
      );
    });

    it('rejects sell with negative fee', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(5, 1000));
      expect(() => processTransaction(h, sellEvent(5, 1000, -1))).toThrow(
        JournalError,
      );
    });
  });

  // --- split -------------------------------------------------------------

  describe('split', () => {
    it('multiplies qty and preserves cost basis', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      const costBefore = h.costBasisCents;
      h = processTransaction(h, {
        type: 'split',
        date: '2026-01-02',
        qty: 0n,
        unitPriceCents: 0n,
        feeCents: 0n,
        factor: 2,
      });
      expect(h.qty).toBe(20n);
      expect(h.costBasisCents).toBe(costBefore);
      expect(h.avgPriceCents).toBe(500n); // 10000 / 20
    });

    it('factor 1 is a valid no-op', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      const costBefore = h.costBasisCents;
      h = processTransaction(h, {
        type: 'split',
        date: '2026-01-02',
        qty: 0n,
        unitPriceCents: 0n,
        feeCents: 0n,
        factor: 1,
      });
      expect(h.qty).toBe(10n);
      expect(h.costBasisCents).toBe(costBefore);
    });

    it('defaults factor to 1 when omitted', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      h = processTransaction(h, {
        type: 'split',
        date: '2026-01-02',
        qty: 0n,
        unitPriceCents: 0n,
        feeCents: 0n,
      });
      expect(h.qty).toBe(10n);
    });

    it('rejects factor < 1', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000));
      expect(() =>
        processTransaction(h, {
          type: 'split',
          date: '2026-01-02',
          qty: 0n,
          unitPriceCents: 0n,
          feeCents: 0n,
          factor: 0,
        }),
      ).toThrow(JournalError);
    });

    it('rejects non-integer factor', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000));
      expect(() =>
        processTransaction(h, {
          type: 'split',
          date: '2026-01-02',
          qty: 0n,
          unitPriceCents: 0n,
          feeCents: 0n,
          factor: 1.5,
        }),
      ).toThrow(JournalError);
    });
  });

  // --- bonificação -------------------------------------------------------

  describe('bonificação', () => {
    it('increases qty; cost basis and avg adjust', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      h = processTransaction(h, {
        type: 'bonificacao',
        date: '2026-01-02',
        qty: 5n,
        unitPriceCents: 0n,
        feeCents: 0n,
      });
      expect(h.qty).toBe(15n);
      expect(h.costBasisCents).toBe(10000n); // unchanged
      expect(h.avgPriceCents).toBe(666n); // floor(10000/15)
    });

    it('rejects zero bonus quantity', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000));
      expect(() =>
        processTransaction(h, {
          type: 'bonificacao',
          date: '2026-01-02',
          qty: 0n,
          unitPriceCents: 0n,
          feeCents: 0n,
        }),
      ).toThrow(JournalError);
    });
  });

  // --- jcp ---------------------------------------------------------------

  describe('jcp', () => {
    it('records income, no qty change', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      h = processTransaction(h, {
        type: 'jcp',
        date: '2026-06-01',
        qty: 10n,
        unitPriceCents: 50n, // R$ 0.50 per share
        feeCents: 0n,
      });
      expect(h.qty).toBe(10n);
      expect(h.costBasisCents).toBe(10000n); // unchanged
      expect(h.realizedPnlCents).toBe(500n); // 10 * 50
    });

    it('rejects zero quantity', () => {
      const h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000));
      expect(() =>
        processTransaction(h, {
          type: 'jcp',
          date: '2026-06-01',
          qty: 0n,
          unitPriceCents: 50n,
          feeCents: 0n,
        }),
      ).toThrow(JournalError);
    });
  });

  // --- amortização -------------------------------------------------------

  describe('amortização', () => {
    it('reduces cost basis, floored at 0', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      h = processTransaction(h, {
        type: 'amortizacao',
        date: '2026-03-01',
        qty: 0n,
        unitPriceCents: 0n,
        feeCents: 0n,
        rate: 50, // R$ 0.50 per share
      });
      // cashInflow = 10 * 50 = 500
      expect(h.qty).toBe(10n);
      expect(h.costBasisCents).toBe(9500n); // 10000 - 500
      expect(h.avgPriceCents).toBe(950n); // 9500 / 10
    });

    it('floors cost basis at 0 when amortisation exceeds it', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 100, 0));
      // costBasis = 1000; amortise 200 per share → 2000 total > 1000
      h = processTransaction(h, {
        type: 'amortizacao',
        date: '2026-03-01',
        qty: 0n,
        unitPriceCents: 0n,
        feeCents: 0n,
        rate: 200,
      });
      expect(h.costBasisCents).toBe(0n); // floored
      expect(h.qty).toBe(10n);
    });

    it('rejects when holding qty is zero', () => {
      expect(() =>
        processTransaction(EMPTY_HOLDING, {
          type: 'amortizacao',
          date: '2026-03-01',
          qty: 0n,
          unitPriceCents: 0n,
          feeCents: 0n,
          rate: 50,
        }),
      ).toThrow('Cannot amortize with zero quantity');
    });

    it('defaults rate to 0 (no-op)', () => {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      const costBefore = h.costBasisCents;
      h = processTransaction(h, {
        type: 'amortizacao',
        date: '2026-03-01',
        qty: 0n,
        unitPriceCents: 0n,
        feeCents: 0n,
      });
      expect(h.costBasisCents).toBe(costBefore);
    });
  });

  // --- adjustment / opening ----------------------------------------------

  describe('adjustment / opening', () => {
    it('seeds state with qty and avg price', () => {
      const h = processTransaction(EMPTY_HOLDING, {
        type: 'opening',
        date: '2026-01-01',
        qty: 100n,
        unitPriceCents: 2500n,
        feeCents: 0n,
      });
      expect(h.qty).toBe(100n);
      expect(h.avgPriceCents).toBe(2500n);
      expect(h.costBasisCents).toBe(250000n);
    });

    it('adjustment works identically to opening', () => {
      const h = processTransaction(EMPTY_HOLDING, {
        type: 'adjustment',
        date: '2026-01-01',
        qty: 50n,
        unitPriceCents: 1000n,
        feeCents: 0n,
      });
      expect(h.qty).toBe(50n);
      expect(h.costBasisCents).toBe(50000n);
    });

    it('rejects negative qty', () => {
      expect(() =>
        processTransaction(EMPTY_HOLDING, {
          type: 'opening',
          date: '2026-01-01',
          qty: -1n,
          unitPriceCents: 1000n,
          feeCents: 0n,
        }),
      ).toThrow(JournalError);
    });

    it('allows zero qty (empty position)', () => {
      const h = processTransaction(EMPTY_HOLDING, {
        type: 'opening',
        date: '2026-01-01',
        qty: 0n,
        unitPriceCents: 0n,
        feeCents: 0n,
      });
      expect(h.qty).toBe(0n);
      expect(h.costBasisCents).toBe(0n);
    });
  });

  // --- createJournalEngine -----------------------------------------------

  describe('createJournalEngine', () => {
    it('returns an engine with processTransaction', () => {
      const engine = createJournalEngine();
      expect(typeof engine.processTransaction).toBe('function');
    });

    it('produces the same result as standalone processTransaction', () => {
      const engine = createJournalEngine();
      const h = engine.processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 50));
      expect(h.qty).toBe(10n);
      expect(h.costBasisCents).toBe(10050n);
    });
  });
});

// ===========================================================================
// Property tests
// ===========================================================================

describe('property tests', () => {
  it('buy→sell round-trip: P&L = −(total fees) when prices match', () => {
    const cases: Array<{ qty: number; price: number; buyFee: number; sellFee: number }> = [
      { qty: 10, price: 1000, buyFee: 50, sellFee: 30 },
      { qty: 1, price: 99999, buyFee: 0, sellFee: 0 },
      { qty: 100, price: 1, buyFee: 0, sellFee: 0 },
      { qty: 3, price: 1001, buyFee: 1, sellFee: 2 },
      { qty: 7, price: 500, buyFee: 10, sellFee: 10 },
    ];

    for (const { qty, price, buyFee, sellFee } of cases) {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(qty, price, buyFee));
      h = processTransaction(h, sellEvent(qty, price, sellFee));

      const expectedPnl = -(buyFee + sellFee);
      expect(h.realizedPnlCents).toBe(BigInt(expectedPnl));
      expect(h.qty).toBe(0n);
      expect(h.costBasisCents).toBe(0n);
    }
  });

  it('buy→sell partial round-trip: cost basis matches remaining position', () => {
    // Buy 10 at 1000 with 0 fee, sell 3 at 1200 with 0 fee
    let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
    h = processTransaction(h, sellEvent(3, 1200, 0));
    // costOfSold = 10000*3/10 = 3000
    // remaining costBasis = 7000
    expect(h.qty).toBe(7n);
    expect(h.costBasisCents).toBe(7000n);
    expect(h.realizedPnlCents).toBe(600n); // 3*1200 - 3000
  });

  it('rateio sum = declared total for various inputs', () => {
    const cases: Array<{ total: number; weights: number[] }> = [
      { total: 100, weights: [1, 1, 1] },
      { total: 100, weights: [3, 7] },
      { total: 1, weights: [1, 1, 1] },
      { total: 999, weights: [1, 2, 3, 4, 5] },
      { total: 10000, weights: [50, 50] },
      { total: 7, weights: [1, 1, 1, 1, 1, 1, 1] },
      { total: 3, weights: [1, 1] },
      { total: 1, weights: [1] },
      { total: 50, weights: [10, 20, 30, 40] },
    ];

    for (const { total, weights } of cases) {
      const allocations = allocate(total, weights);
      const sum = allocations.reduce((s, a) => s + a.allocatedFeeCents, 0);
      expect(sum).toBe(total);
    }
  });

  it('split preserves cost basis for various factors', () => {
    const factors = [1, 2, 3, 5, 10, 100];
    for (const factor of factors) {
      let h = processTransaction(EMPTY_HOLDING, buyEvent(10, 1000, 0));
      const costBefore = h.costBasisCents;
      h = processTransaction(h, {
        type: 'split',
        date: '2026-01-02',
        qty: 0n,
        unitPriceCents: 0n,
        feeCents: 0n,
        factor,
      });
      expect(h.costBasisCents).toBe(costBefore);
      expect(h.qty).toBe(10n * BigInt(factor));
    }
  });

  it('money operations never produce floating-point artifacts', () => {
    // Accumulate 10 000 increments of 1 cent — result must be exact.
    let total = 0n;
    for (let i = 0; i < 10_000; i++) {
      total = add(total, 1n);
    }
    expect(total).toBe(10_000n);

    // Subtract back to zero.
    for (let i = 0; i < 10_000; i++) {
      total = subtract(total, 1n);
    }
    expect(total).toBe(0n);

    // Multiply/divide round-trip on a range of values.
    for (let qty = 1n; qty <= 100n; qty++) {
      for (let price = 1n; price <= 100n; price++) {
        const costBasis = multiply(price, qty);
        const avg = divide(costBasis, qty);
        // avg * qty may differ from costBasis due to floor, but must be <= costBasis.
        expect(multiply(avg, qty)).toBeLessThanOrEqual(costBasis);
      }
    }
  });
});
