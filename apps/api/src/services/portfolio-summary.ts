/**
 * Portfolio aggregate computation (TASK-05, design-04 dashboard hub).
 *
 * Summary and allocation are computed on read from materialized holdings plus
 * live valuations — never stored state (snapshots are the only stored
 * aggregate, written by the worker). All amounts are integer cents in BRL.
 */
import type { HoldingWithAsset } from '../repositories/holdings.js';
import type { ValuationMap } from './valuation.js';

/** One allocation slice (by class or sector). */
export interface AllocationSlice {
  key: string;
  valueCents: bigint;
  /** Display percentage with two decimals (e.g. 42.35). */
  percent: number;
}

/** Portfolio summary aggregate (all values in BRL cents). */
export interface PortfolioSummary {
  totalMarketValueCents: bigint;
  totalCostBasisCents: bigint;
  unrealizedPnlCents: bigint;
  realizedPnlCents: bigint;
  holdingsCount: number;
  /** Cost basis of holdings without a price (excluded from unrealized). */
  unpricedCostBasisCents: bigint;
  currency: 'BRL';
}

/**
 * Computes the portfolio summary over valued holdings.
 * Unpriced holdings contribute cost basis but no market value; unrealized
 * P&L is only reported over priced holdings to stay truthful.
 */
export function computeSummary(
  holdings: HoldingWithAsset[],
  valuations: ValuationMap,
): PortfolioSummary {
  let totalMarketValueCents = 0n;
  let totalCostBasisCents = 0n;
  let pricedCostBasisCents = 0n;
  let realizedPnlCents = 0n;
  let unpricedCostBasisCents = 0n;

  for (const holding of holdings) {
    totalCostBasisCents += holding.costBasisCents;
    realizedPnlCents += holding.realizedPnlCents;
    const valuation = valuations.get(holding.id);
    if (valuation?.marketValueCentsBRL != null) {
      totalMarketValueCents += valuation.marketValueCentsBRL;
      pricedCostBasisCents += holding.costBasisCents;
    } else {
      unpricedCostBasisCents += holding.costBasisCents;
    }
  }

  return {
    totalMarketValueCents,
    totalCostBasisCents,
    unrealizedPnlCents: totalMarketValueCents - pricedCostBasisCents,
    realizedPnlCents,
    holdingsCount: holdings.length,
    unpricedCostBasisCents,
    currency: 'BRL',
  };
}

/**
 * Computes allocation slices grouped by asset class and by sector.
 * Valuation falls back to cost basis when a holding has no live price so
 * allocation always adds up to 100% of total value.
 */
export function computeAllocation(
  holdings: HoldingWithAsset[],
  valuations: ValuationMap,
): { byClass: AllocationSlice[]; bySector: AllocationSlice[] } {
  const byClass = buildSlices(
    holdings,
    valuations,
    (h) => h.asset.class,
  );
  const bySector = buildSlices(
    holdings,
    valuations,
    (h) => h.asset.sector ?? 'Outros',
  );
  return { byClass, bySector };
}

function buildSlices(
  holdings: HoldingWithAsset[],
  valuations: ValuationMap,
  keyOf: (h: HoldingWithAsset) => string,
): AllocationSlice[] {
  const totals = new Map<string, bigint>();
  let grandTotal = 0n;

  for (const holding of holdings) {
    const valuation = valuations.get(holding.id);
    const value =
      valuation?.marketValueCentsBRL != null
        ? valuation.marketValueCentsBRL
        : holding.costBasisCents;
    const key = keyOf(holding);
    totals.set(key, (totals.get(key) ?? 0n) + value);
    grandTotal += value;
  }

  const slices: AllocationSlice[] = [];
  for (const [key, value] of totals) {
    slices.push({
      key,
      valueCents: value,
      percent: grandTotal > 0n ? Number((value * 10_000n) / grandTotal) / 100 : 0,
    });
  }
  slices.sort((a, b) => (b.valueCents > a.valueCents ? 1 : b.valueCents < a.valueCents ? -1 : 0));
  return slices;
}
