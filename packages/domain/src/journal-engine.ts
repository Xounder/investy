/**
 * Transaction journal engine — the source of truth for every position (ADR-005).
 *
 * Processes journal events and derives holding state using the average-cost
 * method. All money values are integer cents (bigint, ADR-004).
 *
 * Supported event types: buy, sell, split, bonificacao, jcp, amortizacao,
 * adjustment, opening.
 */

import type { Holding, JournalEvent, TransactionType } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** An empty holding with zeroed position state. */
export const EMPTY_HOLDING: Holding = {
  qty: 0n,
  avgPriceCents: 0n,
  costBasisCents: 0n,
  realizedPnlCents: 0n,
};

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/** Error thrown when a journal event is invalid for the given holding state. */
export class JournalError extends Error {
  constructor(
    message: string,
    public readonly eventType: TransactionType,
  ) {
    super(message);
    this.name = 'JournalError';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Journal engine contract.
 */
export interface JournalEngine {
  processTransaction(holding: Holding, event: JournalEvent): Holding;
}

/**
 * Creates a journal engine instance.
 */
export function createJournalEngine(): JournalEngine {
  return { processTransaction };
}

/**
 * Processes a single journal event against a holding, returning the updated
 * holding state. Pure function — no side effects.
 *
 * @throws {JournalError} if the event is invalid for the current state.
 */
export function processTransaction(holding: Holding, event: JournalEvent): Holding {
  switch (event.type) {
    case 'buy':
      return applyBuy(holding, event);
    case 'sell':
      return applySell(holding, event);
    case 'split':
      return applySplit(holding, event);
    case 'bonificacao':
      return applyBonificacao(holding, event);
    case 'jcp':
      return applyJcp(holding, event);
    case 'amortizacao':
      return applyAmortizacao(holding, event);
    case 'adjustment':
    case 'opening':
      return applySeeding(holding, event);
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Buy: qty += q; costBasis += q·price + fee; avg = costBasis / qty.
 */
function applyBuy(holding: Holding, event: JournalEvent): Holding {
  if (event.qty <= 0n) {
    throw new JournalError('Buy quantity must be positive', event.type);
  }
  if (event.feeCents < 0n) {
    throw new JournalError('Fee must not be negative', event.type);
  }

  const newQty = holding.qty + event.qty;
  const costIncrease = event.qty * event.unitPriceCents + event.feeCents;
  const newCostBasis = holding.costBasisCents + costIncrease;
  const newAvg = newQty > 0n ? newCostBasis / newQty : 0n;

  return {
    qty: newQty,
    avgPriceCents: newAvg,
    costBasisCents: newCostBasis,
    realizedPnlCents: holding.realizedPnlCents,
  };
}

/**
 * Sell: average-cost realised P&L = (unitPrice·q − fee) − costBasis·q/qty.
 * Uses proportional cost-of-sold computation to minimise rounding drift.
 */
function applySell(holding: Holding, event: JournalEvent): Holding {
  if (event.qty <= 0n) {
    throw new JournalError('Sell quantity must be positive', event.type);
  }
  if (event.qty > holding.qty) {
    throw new JournalError('Cannot sell more than held', event.type);
  }
  if (event.feeCents < 0n) {
    throw new JournalError('Fee must not be negative', event.type);
  }

  const grossProceeds = event.qty * event.unitPriceCents;
  const netProceeds = grossProceeds - event.feeCents;

  // Cost of sold shares — proportional to minimise rounding vs using avg.
  const costOfSoldShares = (holding.costBasisCents * event.qty) / holding.qty;

  const realizedPnl = netProceeds - costOfSoldShares;

  const newQty = holding.qty - event.qty;
  const newCostBasis = holding.costBasisCents - costOfSoldShares;
  const newAvg = newQty > 0n ? newCostBasis / newQty : 0n;

  return {
    qty: newQty,
    avgPriceCents: newAvg,
    costBasisCents: newCostBasis,
    realizedPnlCents: holding.realizedPnlCents + realizedPnl,
  };
}

/**
 * Split: qty × factor; cost basis unchanged; avg adjusts.
 */
function applySplit(holding: Holding, event: JournalEvent): Holding {
  const factor = Number(event.factor ?? 1);
  if (!Number.isInteger(factor) || factor < 1) {
    throw new JournalError('Split factor must be a positive integer', event.type);
  }

  const bigFactor = BigInt(factor);
  const newQty = holding.qty * bigFactor;
  const newAvg = newQty > 0n ? holding.costBasisCents / newQty : 0n;

  return {
    qty: newQty,
    avgPriceCents: newAvg,
    costBasisCents: holding.costBasisCents,
    realizedPnlCents: holding.realizedPnlCents,
  };
}

/**
 * Bonificação: bonus shares increase qty; cost basis unchanged; avg adjusts.
 */
function applyBonificacao(holding: Holding, event: JournalEvent): Holding {
  if (event.qty <= 0n) {
    throw new JournalError('Bonus quantity must be positive', event.type);
  }

  const newQty = holding.qty + event.qty;
  const newAvg = newQty > 0n ? holding.costBasisCents / newQty : 0n;

  return {
    qty: newQty,
    avgPriceCents: newAvg,
    costBasisCents: holding.costBasisCents,
    realizedPnlCents: holding.realizedPnlCents,
  };
}

/**
 * JCP / Rendimento: income = qty × unitPriceCents; no qty change.
 */
function applyJcp(holding: Holding, event: JournalEvent): Holding {
  if (event.qty <= 0n) {
    throw new JournalError('JCP quantity must be positive', event.type);
  }

  const income = event.qty * event.unitPriceCents;

  return {
    ...holding,
    realizedPnlCents: holding.realizedPnlCents + income,
  };
}

/**
 * Amortização: cash inflow = qty × rate; cost basis reduced (floored at 0).
 */
function applyAmortizacao(holding: Holding, event: JournalEvent): Holding {
  if (holding.qty <= 0n) {
    throw new JournalError('Cannot amortize with zero quantity', event.type);
  }

  const rate = event.rate ?? 0;
  if (rate < 0) {
    throw new JournalError('Amortization rate must not be negative', event.type);
  }

  const cashInflow = holding.qty * BigInt(Math.round(rate));
  const newCostBasis = holding.costBasisCents - cashInflow;
  const flooredCostBasis = newCostBasis < 0n ? 0n : newCostBasis;
  const newAvg = holding.qty > 0n ? flooredCostBasis / holding.qty : 0n;

  return {
    qty: holding.qty,
    avgPriceCents: newAvg,
    costBasisCents: flooredCostBasis,
    realizedPnlCents: holding.realizedPnlCents,
  };
}

/**
 * Adjustment / Opening: seeds state with qty + avg price.
 * costBasis = qty × unitPriceCents; realised PnL is preserved.
 */
function applySeeding(holding: Holding, event: JournalEvent): Holding {
  if (event.qty < 0n) {
    throw new JournalError('Quantity must not be negative', event.type);
  }

  const newAvg = event.qty > 0n ? event.unitPriceCents : 0n;
  const newCostBasis = event.qty * event.unitPriceCents;

  return {
    qty: event.qty,
    avgPriceCents: newAvg,
    costBasisCents: newCostBasis,
    realizedPnlCents: holding.realizedPnlCents,
  };
}
