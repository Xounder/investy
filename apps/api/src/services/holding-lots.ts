import type { TransactionTable } from '../db/schema.js';

/** Display-only acquisition cohorts. Sales reduce every open cohort proportionally;
 * cost is allocated from the materialized average-cost position, not tax-lot FIFO. */
type DisplayLot = { accountId: string; transactionId: string | null; date: Date | null; qty: bigint; costBasisCents: bigint; currency: 'BRL' };

export function buildHoldingLots(
  accounts: Array<{ accountId: string; qty: bigint; costBasisCents: bigint; events: TransactionTable[] }>,
): DisplayLot[] {
  return accounts.flatMap(({ accountId, qty, costBasisCents, events }): DisplayLot[] => {
    const cohorts: Array<{ transactionId: string; date: Date; qty: bigint }> = [];
    for (const event of events) {
      if (event.type === 'buy' || event.type === 'opening' || event.type === 'adjustment' || event.type === 'bonificacao') {
        if (event.qty > 0n) cohorts.push({ transactionId: event.id, date: event.date, qty: event.qty });
      } else if (event.type === 'sell') {
        const available = cohorts.reduce((sum, lot) => sum + lot.qty, 0n);
        if (available === 0n || event.qty > available) continue;
        let remaining = event.qty;
        // Deterministic largest-remainder allocation, not a sale-lot election.
        const allocations = cohorts.map((lot) => ({
          lot,
          count: (lot.qty * event.qty) / available,
          remainder: (lot.qty * event.qty) % available,
        }));
        remaining -= allocations.reduce((sum, item) => sum + item.count, 0n);
        for (const item of [...allocations].sort((a, b) =>
          a.remainder === b.remainder ? a.lot.date.getTime() - b.lot.date.getTime() || a.lot.transactionId.localeCompare(b.lot.transactionId)
            : a.remainder > b.remainder ? -1 : 1)) {
          if (remaining === 0n) break;
          item.count += 1n;
          remaining -= 1n;
        }
        for (const item of allocations) item.lot.qty -= item.count;
      } else if (event.type === 'split' && event.factor != null) {
        // Match the final materialized quantity after corporate actions below.
        for (const lot of cohorts) lot.qty = BigInt(Math.round(Number(lot.qty) * event.factor));
      }
    }
    const open = cohorts.filter((lot) => lot.qty > 0n);
    const total = open.reduce((sum, lot) => sum + lot.qty, 0n);
    if (total !== qty || total === 0n) {
      // Corporate actions or historical adjustments can make cohort quantities
      // ambiguous; report one truthful account-level average-cost lot instead.
      return qty > 0n ? [{ accountId, transactionId: null, date: null, qty, costBasisCents, currency: 'BRL' as const }] : [];
    }
    let allocated = 0n;
    return open.map((lot, index) => {
      const cost = index === open.length - 1 ? costBasisCents - allocated : costBasisCents * lot.qty / qty;
      allocated += cost;
      return { accountId, transactionId: lot.transactionId, date: lot.date, qty: lot.qty, costBasisCents: cost, currency: 'BRL' as const };
    });
  });
}
