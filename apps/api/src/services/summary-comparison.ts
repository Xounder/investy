import type { PortfolioSnapshotTable } from '../db/schema.js';
import type { HoldingWithAsset } from '../repositories/holdings.js';
import type { PortfolioSummary } from './portfolio-summary.js';
import type { ValuationMap } from './valuation.js';

export interface Delta {
  amountCents: bigint;
  /** Percentage points, null if the historical denominator is zero. */
  percent: number | null;
}

export interface SummaryComparison {
  /** An observed BRL portfolio-value difference, including deposits and withdrawals; NOT investment return. */
  kind: 'observed_value_including_cash_flows';
  currency: 'BRL';
  timezone: 'America/Sao_Paulo';
  currentAt: string;
  previousAt: string | null;
  previousDate: string | null;
  /** Label as the actual observed interval; not necessarily a one-day change. */
  period: 'since_snapshot' | null;
  reason: 'NO_SNAPSHOT' | 'INCOMPLETE_COVERAGE' | 'INCOMPLETE_VALUATION' | 'MISSING_FX' | null;
  hasStaleQuotes: boolean;
  total: Delta | null;
  cost: Delta | null;
  unrealized: Delta | null;
  dayMainChange: Delta | null;
}

export function saoPauloDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function delta(current: bigint, prior: bigint): Delta {
  const amountCents = current - prior;
  const percent = prior === 0n ? null : Number(amountCents) / Number(prior < 0n ? -prior : prior) * 100;
  return { amountCents, percent: percent !== null && Number.isFinite(percent) ? percent : null };
}

/** Compare today's live BRL totals to a coherent date of historical BRL snapshots. */
export function compareSummary(
  summary: PortfolioSummary,
  holdings: HoldingWithAsset[],
  valuations: ValuationMap,
  portfolioIds: string[],
  snapshots: PortfolioSnapshotTable[],
  now: Date,
): SummaryComparison {
  const today = saoPauloDate(now);
  const hasStaleQuotes = holdings.some(h => valuations.get(h.id)?.isStale === true);
  const base: SummaryComparison = {
    kind: 'observed_value_including_cash_flows', currency: 'BRL', timezone: 'America/Sao_Paulo',
    currentAt: now.toISOString(), previousAt: null, previousDate: null, period: null,
    reason: null, hasStaleQuotes, total: null, cost: null, unrealized: null, dayMainChange: null,
  };
  if (summary.unpricedCostBasisCents !== 0n || holdings.some(h => valuations.get(h.id)?.marketValueCentsBRL == null)) {
    const missingFx = holdings.some(h => {
      const v = valuations.get(h.id);
      return v?.priceCents != null && v.currency !== 'BRL' && v.priceCentsBRL == null;
    });
    return { ...base, reason: missingFx ? 'MISSING_FX' : 'INCOMPLETE_VALUATION' };
  }

  // Group by local date; each portfolio must have a real row on exactly the same date.
  const byDate = new Map<string, Map<string, PortfolioSnapshotTable>>();
  for (const row of snapshots) {
    const date = saoPauloDate(row.date);
    if (date >= today || !portfolioIds.includes(row.portfolioId)) continue;
    const rows = byDate.get(date) ?? new Map<string, PortfolioSnapshotTable>();
    const existing = rows.get(row.portfolioId);
    if (!existing || row.date > existing.date) rows.set(row.portfolioId, row);
    byDate.set(date, rows);
  }
  const priorDate = [...byDate.keys()].sort().reverse().find(date => byDate.get(date)?.size === portfolioIds.length);
  if (!priorDate) return { ...base, reason: snapshots.length ? 'INCOMPLETE_COVERAGE' : 'NO_SNAPSHOT' };
  const priorRows = [...byDate.get(priorDate)!.values()];
  const priorTotal = priorRows.reduce((sum, row) => sum + row.totalValueCents, 0n);
  const priorCost = priorRows.reduce((sum, row) => sum + row.costBasisCents, 0n);
  const total = delta(summary.totalMarketValueCents, priorTotal);
  return {
    ...base, previousAt: priorRows.map(row => row.date.toISOString()).sort().at(-1)!,
    previousDate: priorDate, period: 'since_snapshot', total,
    cost: delta(summary.totalCostBasisCents, priorCost),
    unrealized: delta(summary.unrealizedPnlCents, priorTotal - priorCost),
    dayMainChange: total,
  };
}
