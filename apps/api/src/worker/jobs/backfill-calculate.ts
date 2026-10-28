import type { AssetTable, QuoteTable, TransactionTable } from '../../db/schema.js';
import { replayJournal, type JournalRowLike, toBRL } from '../../services/journal-money.js';
import { localTime } from '../scheduler.js';
import { asOfFx } from './close-fx.js';

export type HistoricalRow = { transaction: TransactionTable; asset: AssetTable };
export type HistoricalQuote = { quote: QuoteTable; asset: AssetTable };

/** Uses the production journal replay and acquisition FX; prices are raw observed quotes, never adjusted history. */
export function historicalTotals(
  events: HistoricalRow[], observations: HistoricalQuote[], fxObservation: HistoricalQuote | undefined,
  overriddenAssets: Set<string>, close: Date,
): { totalValueCents: bigint; costBasisCents: bigint; allocationJsonb: object } | null {
  const groups = new Map<string, HistoricalRow[]>();
  for (const event of events) {
    if (event.transaction.date > close) continue;
    const key = JSON.stringify([event.transaction.accountId, event.transaction.assetId]);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const latest = new Map<string, HistoricalQuote>();
  for (const row of observations) {
    if (row.quote.fetchedAt > close || row.quote.validUntil <= close || row.quote.isStale ||
      row.quote.priceCents <= 0n || row.quote.currency !== row.asset.currency ||
      localTime(row.quote.fetchedAt).date !== localTime(close).date) continue;
    const prior = latest.get(row.asset.id);
    if (!prior || prior.quote.fetchedAt < row.quote.fetchedAt) latest.set(row.asset.id, row);
  }
  const allocation = new Map<string, bigint>();
  const sectors = new Map<string, bigint>();
  let totalValueCents = 0n, costBasisCents = 0n;
  for (const group of groups.values()) {
    const ordered = group.map(({ transaction }) => transaction).sort((a, b) =>
      a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    const holding = replayJournal(ordered as JournalRowLike[]);
    if (holding.qty < 0n) return null;
    if (holding.qty === 0n) continue;
    const asset = group[0]!.asset;
    // Override history does not exist. Even an override created later is ambiguous; fail closed.
    if (overriddenAssets.has(asset.id)) return null;
    const observed = latest.get(asset.id);
    if (!observed) return null;
    let priceBRL: bigint;
    if (asset.currency === 'BRL') priceBRL = observed.quote.priceCents;
    else {
      const fx = asOfFx(fxObservation?.quote, close);
      if (asset.currency !== 'USD' || fx == null) return null;
      priceBRL = toBRL(observed.quote.priceCents, 'USD', fx);
    }
    const amount = holding.qty * priceBRL;
    totalValueCents += amount;
    costBasisCents += holding.costBasisCents;
    allocation.set(asset.class, (allocation.get(asset.class) ?? 0n) + amount);
    const sector = asset.sector ?? 'Outros';
    sectors.set(sector, (sectors.get(sector) ?? 0n) + amount);
  }
  const slices = (items: Map<string, bigint>) => [...items].map(([key, valueCents]) => ({ key,
    valueCents: valueCents.toString(),
    percent: totalValueCents > 0n ? Number(valueCents * 10_000n / totalValueCents) / 100 : 0 }));
  return { totalValueCents, costBasisCents, allocationJsonb: {
    byClass: slices(allocation), bySector: slices(sectors),
    currency: 'BRL', priceBasis: 'observed_intraday_valid_at_close',
  } };
}
