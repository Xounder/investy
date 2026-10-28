import type { JournalRowLike } from './journal-money.js';
import { replayJournalWithSales } from './journal-money.js';

type Row = Record<string, unknown> & { id: string };
type Archive = { accounts: Row[]; transactions: Row[]; holdings: Row[] };
const invalid = (message: string): never => { throw new Error(`INVALID_EXPORT: ${message}`); };
const pair = (accountId: unknown, assetId: unknown) => JSON.stringify([accountId, assetId]);

/** Check the materialized read model against the SAME replay/FX path used by
 * journal writes. Exported holdings are retained only after verification so
 * their IDs and historical timestamps survive the round trip unchanged. */
export function verifyRestoredHoldings(data: Archive): void {
  const events = new Map<string, Row[]>();
  for (const row of data.transactions) {
    const key = pair(row.accountId, row.assetId);
    events.set(key, [...(events.get(key) ?? []), row]);
  }
  const positions = new Map<string, Row>();
  for (const row of data.holdings) {
    const key = pair(row.accountId, row.assetId);
    if (positions.has(key) || !events.has(key)) invalid('orphan or duplicate holding');
    positions.set(key, row);
  }
  for (const [key, group] of events) {
    if (group.some((row) => !(row.date instanceof Date) || !(row.createdAt instanceof Date) ||
      typeof row.qty !== 'bigint' || typeof row.unitPriceCents !== 'bigint' ||
      typeof row.feeCents !== 'bigint' || typeof row.type !== 'string' ||
      (row.factor !== null && !Number.isSafeInteger(row.factor)) ||
      (row.amortRateCents !== null && typeof row.amortRateCents !== 'bigint'))) {
      invalid('journal fields cannot be replayed');
    }
    const ordered = [...group].sort((a, b) =>
      (a.date as Date).getTime() - (b.date as Date).getTime() ||
      (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const result = (() => {
      try { return replayJournalWithSales(ordered as unknown as JournalRowLike[]); }
      catch (error) { return invalid(`journal replay failed: ${error instanceof Error ? error.message : 'invalid event'}`); }
    })();
    const actual = positions.get(key);
    if (!actual || actual.qty !== result.holding.qty || actual.avgPriceCents !== result.holding.avgPriceCents ||
      actual.costBasisCents !== result.holding.costBasisCents || actual.realizedPnlCents !== result.holding.realizedPnlCents) {
      invalid('holding does not match journal replay');
    }
    for (const sale of result.sales) {
      if (ordered[sale.index]!.realizedPnlCents !== sale.realizedPnlCents) invalid('sale profit does not match journal replay');
    }
  }
}
