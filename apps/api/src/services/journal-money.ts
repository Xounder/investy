import { EMPTY_HOLDING, processTransaction, type Holding, type JournalEvent, type TransactionType } from '@investy/domain';

/** FX rates use the same micro-unit scale as the quote cache (5.25 = 5250000). */
const SCALE = 1_000_000n;
export function usesMoney(type: TransactionType): boolean {
  return type === 'buy' || type === 'sell' || type === 'opening' || type === 'adjustment' || type === 'dividend' || type === 'jcp' || type === 'amortizacao';
}

export interface JournalRowLike {
  type: TransactionType;
  date: Date;
  qty: bigint;
  unitPriceCents: bigint;
  feeCents: bigint;
  currency?: string | null;
  fxRateToBRL?: bigint | null;
  factor: number | null;
  amortRateCents: bigint | null;
}

export function validateJournalMoney(currency: string, fxRateToBRL: bigint | null | undefined): void {
  if (currency === 'BRL') {
    if (fxRateToBRL != null) throw new Error('BRL transactions must not include FX');
  } else if (currency !== 'USD' || fxRateToBRL == null || fxRateToBRL <= 0n) {
    throw new Error('USD transactions require a positive historical fxRateToBRL');
  }
}

export function toBRL(cents: bigint, currency: string, fxRateToBRL: bigint | null | undefined): bigint {
  validateJournalMoney(currency, fxRateToBRL);
  if (currency === 'BRL') return cents;
  // Round once per monetary field to the nearest cent; never use floating point for persisted money.
  return (cents * fxRateToBRL! + SCALE / 2n) / SCALE;
}

/** Replays chronological journal rows, returning the final holding and each sale's incremental profit. */
export function replayJournalWithSales(rows: JournalRowLike[]): {
  holding: Holding;
  sales: Array<{ index: number; realizedPnlCents: bigint }>;
} {
  let holding: Holding = EMPTY_HOLDING;
  const sales: Array<{ index: number; realizedPnlCents: bigint }> = [];
  for (const [index, row] of rows.entries()) {
    const currency = row.currency ?? 'BRL';
    // Only cash-bearing events need an acquisition exchange rate.
    const monetary = usesMoney(row.type);
    const event: JournalEvent = {
      type: row.type,
      date: row.date.toISOString(),
      qty: row.qty,
      // Income and capital returns must convert the entire cash amount, never round per share.
      unitPriceCents: monetary && row.type !== 'dividend' && row.type !== 'jcp' ? toBRL(row.unitPriceCents, currency, row.fxRateToBRL) : row.unitPriceCents,
      feeCents: monetary && row.type !== 'dividend' && row.type !== 'jcp' ? toBRL(row.feeCents, currency, row.fxRateToBRL) : row.feeCents,
      dividendIncomeCents: row.type === 'dividend' || row.type === 'jcp'
        ? toBRL(row.qty * row.unitPriceCents, currency, row.fxRateToBRL) : undefined,
      amortizationCents: row.type === 'amortizacao' && row.amortRateCents != null
        ? toBRL(row.qty * row.amortRateCents, currency, row.fxRateToBRL) : undefined,
      factor: row.factor ?? undefined,
      rate: row.amortRateCents != null
        ? Number(toBRL(row.amortRateCents, currency, row.fxRateToBRL)) : undefined,
    };
    const next = processTransaction(holding, event);
    if (row.type === 'sell') sales.push({ index, realizedPnlCents: next.realizedPnlCents - holding.realizedPnlCents });
    holding = next;
  }
  return { holding, sales };
}

export function replayJournal(rows: JournalRowLike[]): Holding {
  return replayJournalWithSales(rows).holding;
}
