import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { accounts, assets, dividends, holdings, portfolios, transactions } from '../db/schema.js';
import { replayJournalWithSales, toBRL } from './journal-money.js';
import { projectFii } from './dividends/projection.js';

type Dividend = typeof dividends.$inferSelect;
export type DividendKind = Dividend['kind'];
export type DividendStatus = Dividend['status'];
export class DividendError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT', message: string) { super(message); }
}

function day(date: Date | null): string | null { return date?.toISOString().slice(0, 10) ?? null; }
function details(row: Dividend, asset: { symbol: string; name: string; class: string; currency: string } | undefined,
  journal: (typeof transactions.$inferSelect)[]) {
  const qty = eligibleTotal(journal, row.exDate);
  const currency = asset?.currency ?? 'BRL';
  const nativeAmount = qty * row.rateCentsPerUnit;
  const receipts = row.status === 'paid' ? journal.filter((event) => event.dividendId === row.id) : [];
  // Do not infer legacy links from mutable notes: historical paid rows without a trusted
  // association require reconciliation before they can contribute to income totals.
  const reconciliationRequired = row.status === 'paid' && qty > 0n && receipts.length === 0;
  const amountBRL = reconciliationRequired ? null : row.status === 'paid' ? receipts.reduce((sum, event) =>
    sum + toBRL(event.qty * event.unitPriceCents, event.currency, event.fxRateToBRL), 0n) :
    currency === 'BRL' ? nativeAmount : null;
  return { id: row.id, portfolioId: row.portfolioId, assetId: row.assetId,
    symbol: asset?.symbol ?? null, assetName: asset?.name ?? null, assetClass: asset?.class ?? null,
    kind: row.kind, category: row.kind === 'amortizacao' ? 'return_of_capital' : 'income',
    exDate: day(row.exDate), paymentDate: day(row.paymentDate), rateCentsPerUnit: row.rateCentsPerUnit.toString(),
    currency, eligibleQty: qty.toString(), nativeAmountCents: nativeAmount.toString(),
    amountCurrency: amountBRL === null ? currency : 'BRL',
    amountCents: (amountBRL ?? nativeAmount).toString(), amountCentsBRL: amountBRL?.toString() ?? null,
    status: row.status, source: row.source, reconciliationRequired };
}

/** Historical entitlement is computed at the start of the ex-date, never from today's holding. */
export function eligibleQuantity(rows: (typeof transactions.$inferSelect)[], exDate: Date): bigint {
  const eligible = rows.filter((row) => row.date < exDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  return replayJournalWithSales(eligible).holding.qty;
}

function eligibleTotal(rows: (typeof transactions.$inferSelect)[], exDate: Date): bigint {
  const accounts = [...new Set(rows.map((row) => row.accountId))];
  return accounts.reduce((sum, accountId) => sum + eligibleQuantity(rows.filter((row) => row.accountId === accountId), exDate), 0n);
}

async function ownedRows(userId: string, assetId: string, portfolioId: string) {
  return getDb().select().from(transactions).where(and(eq(transactions.userId, userId),
    eq(transactions.assetId, assetId), eq(transactions.portfolioId, portfolioId)));
}

export async function listAgenda(userId: string, from: Date, to: Date) {
  const db = getDb();
  const [rows, catalog, history] = await Promise.all([
    db.select().from(dividends).where(and(eq(dividends.userId, userId), gte(dividends.exDate, from), lte(dividends.exDate, to))).orderBy(asc(dividends.exDate)),
    db.select().from(assets),
    db.select({ assetId: dividends.assetId, exDate: dividends.exDate }).from(dividends)
      .where(and(eq(dividends.userId, userId), lt(dividends.exDate, to))),
  ]);
  const byAsset = new Map(catalog.map((asset) => [asset.id, asset]));
  const items = await Promise.all(rows.map(async (row) => details(row, byAsset.get(row.assetId),
    await ownedRows(userId, row.assetId, row.portfolioId))));
  const projections = [...new Set(history.map((row) => row.assetId))]
    .filter((id) => byAsset.get(id)?.class === 'fii')
    .map((id) => projectFii(id, history.filter((row) => row.assetId === id).map((row) => row.exDate), from))
    .filter((p) => p !== null && p.nextExDate >= day(from)! && p.nextExDate <= day(to)!);
  return { items, projections };
}

export async function listHistory(userId: string, year: number, month?: number) {
  const db = getDb();
  const start = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  const end = new Date(Date.UTC(year, month ?? 12, 1));
  const [rows, catalog] = await Promise.all([
    db.select().from(dividends).where(and(eq(dividends.userId, userId), eq(dividends.status, 'paid'),
      gte(dividends.paymentDate, start), lt(dividends.paymentDate, end))).orderBy(asc(dividends.paymentDate)),
    db.select().from(assets),
  ]);
  const byAsset = new Map(catalog.map((asset) => [asset.id, asset]));
  const entries = await Promise.all(rows.map(async (row) => details(row, byAsset.get(row.assetId),
    await ownedRows(userId, row.assetId, row.portfolioId))));
  const income = entries.filter((item) => item.category === 'income');
  const months = [...new Set(entries.map((item) => item.paymentDate!.slice(0, 7)))].map((key) => {
    const items = entries.filter((item) => item.paymentDate!.startsWith(key));
    const incomeItems = items.filter((item) => item.category === 'income');
    return { year: Number(key.slice(0, 4)), month: Number(key.slice(5)),
      totalCents: incomeItems.reduce((sum, item) => sum + BigInt(item.amountCentsBRL ?? '0'), 0n).toString(),
      totalsIncomplete: incomeItems.some((item) => item.reconciliationRequired), items };
  });
  return { year, month: month ?? null,
    totalCents: income.reduce((sum, item) => sum + BigInt(item.amountCentsBRL ?? '0'), 0n).toString(),
    totalsIncomplete: income.some((item) => item.reconciliationRequired), months };
}

export async function createDividend(userId: string, input: {
  assetId: string; portfolioId: string; kind: DividendKind; exDate: Date; paymentDate?: Date | null;
  rateCentsPerUnit: bigint;
}, source: Dividend['source'] = 'manual') {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`dividend:${userId}:${input.portfolioId}:${input.assetId}:${day(input.exDate)}`}::text, 0))`);
    const [portfolio] = await tx.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, input.portfolioId), eq(portfolios.userId, userId)));
    if (!portfolio) throw new DividendError('NOT_FOUND', 'Portfolio not found');
    const [asset] = await tx.select().from(assets).where(eq(assets.id, input.assetId));
    if (!asset) throw new DividendError('NOT_FOUND', 'Asset not found');
    const existing = await tx.select().from(dividends).where(and(eq(dividends.userId, userId),
      eq(dividends.portfolioId, input.portfolioId), eq(dividends.assetId, input.assetId), eq(dividends.exDate, input.exDate), eq(dividends.kind, input.kind)));
    if (existing.length) throw new DividendError('CONFLICT', 'Dividend already exists for this asset, kind and ex-date');
    const journal = await tx.select().from(transactions).where(and(eq(transactions.userId, userId),
      eq(transactions.portfolioId, input.portfolioId), eq(transactions.assetId, input.assetId)));
    const [row] = await tx.insert(dividends).values({ ...input, userId, id: crypto.randomUUID(), source, status: 'expected' }).returning();
    return details(row!, asset, journal);
  });
}

export async function updateDividend(userId: string, id: string,
  patch: { status?: DividendStatus; paymentDate?: Date; fxRateToBRL?: bigint }) {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`dividend:${userId}:${id}`}::text, 0))`);
    const [row] = await tx.select().from(dividends).where(and(eq(dividends.id, id), eq(dividends.userId, userId)));
    if (!row) throw new DividendError('NOT_FOUND', 'Dividend not found');
    if ((patch.status === 'confirmed' && row.status !== 'expected') ||
      (patch.status === 'paid' && row.status !== 'confirmed') ||
      (patch.status === 'expected') || row.status === 'paid') {
      throw new DividendError('CONFLICT', 'Invalid dividend status transition');
    }
    const paymentDate = patch.paymentDate ?? row.paymentDate;
    if (paymentDate && paymentDate <= row.exDate) throw new DividendError('VALIDATION', 'Payment date must be after ex-date');
    if (patch.status === 'confirmed' && !paymentDate) throw new DividendError('VALIDATION', 'Confirmation requires a payment date');
    if (patch.fxRateToBRL !== undefined && patch.status !== 'paid') {
      throw new DividendError('VALIDATION', 'Historical FX may only be supplied when marking paid');
    }
    if (patch.status === 'paid') {
      if (!paymentDate) throw new DividendError('VALIDATION', 'Payment date required');
      await postReceipt(tx, row, userId, paymentDate, patch.fxRateToBRL);
    }
    const [updated] = await tx.update(dividends).set({ ...(patch.status ? { status: patch.status } : {}), paymentDate })
      .where(and(eq(dividends.id, id), eq(dividends.userId, userId))).returning();
    const [asset] = await tx.select().from(assets).where(eq(assets.id, row.assetId));
    const journal = await tx.select().from(transactions).where(and(eq(transactions.userId, userId),
      eq(transactions.portfolioId, row.portfolioId), eq(transactions.assetId, row.assetId)));
    return details(updated!, asset, journal);
  });
}

async function postReceipt(tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0], row: Dividend,
  userId: string, paymentDate: Date, fxRateToBRL?: bigint) {
  const [asset] = await tx.select().from(assets).where(eq(assets.id, row.assetId));
  if (!asset || (asset.currency !== 'BRL' && asset.currency !== 'USD')) {
    throw new DividendError('VALIDATION', 'Automatic receipts require a BRL or USD asset');
  }
  if (asset.currency === 'USD' && (!fxRateToBRL || fxRateToBRL <= 0n)) {
    throw new DividendError('VALIDATION', 'USD receipts require the original historical fxRateToBRL in micro-BRL per USD');
  }
  if (asset.currency === 'BRL' && fxRateToBRL !== undefined) {
    throw new DividendError('VALIDATION', 'BRL receipts must not include FX');
  }
  const ownedAccounts = await tx.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.portfolioId, row.portfolioId)));
  // Stable ordering matches the journal batch writer and prevents inverted-lock deadlocks.
  for (const account of ownedAccounts.sort((a, b) => a.id.localeCompare(b.id))) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`journal:${userId}:${account.id}`}::text, 0))`);
    const journal = await tx.select().from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.accountId, account.id), eq(transactions.assetId, row.assetId)))
      .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id));
    const qty = eligibleQuantity(journal, row.exDate);
    if (qty <= 0n) continue;
    if (journal.some((event) => event.dividendId === row.id)) throw new DividendError('CONFLICT', 'Receipt already posted');
    await tx.insert(transactions).values({ id: crypto.randomUUID(), userId, portfolioId: row.portfolioId,
      // Capital return changes the entitled shares' basis before a later sale,
      // even when cash is received after those shares have been sold.
      accountId: account.id, assetId: row.assetId, date: row.kind === 'amortizacao' ? row.exDate : paymentDate,
      type: row.kind === 'rendimento' ? 'dividend' : row.kind, qty, unitPriceCents: row.rateCentsPerUnit,
       feeCents: 0n, currency: asset.currency, fxRateToBRL: fxRateToBRL ?? null,
       amortRateCents: row.kind === 'amortizacao' ? row.rateCentsPerUnit : null,
       source: 'manual', dividendId: row.id, notes: `dividend:${row.id}` });
    const updatedJournal = await tx.select().from(transactions).where(and(eq(transactions.userId, userId),
      eq(transactions.accountId, account.id), eq(transactions.assetId, row.assetId)))
      .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id));
    const { holding, sales } = replayJournalWithSales(updatedJournal);
    for (const sale of sales) {
      const event = updatedJournal[sale.index]!;
      if (event.realizedPnlCents !== sale.realizedPnlCents) await tx.update(transactions).set({ realizedPnlCents: sale.realizedPnlCents })
        .where(and(eq(transactions.id, event.id), eq(transactions.userId, userId)));
    }
    const [current] = await tx.select().from(holdings).where(and(eq(holdings.userId, userId), eq(holdings.accountId, account.id), eq(holdings.assetId, row.assetId)));
    const values = { qty: holding.qty, avgPriceCents: holding.avgPriceCents, costBasisCents: holding.costBasisCents,
      realizedPnlCents: holding.realizedPnlCents, updatedAt: new Date() };
    if (current) await tx.update(holdings).set(values).where(and(eq(holdings.id, current.id), eq(holdings.userId, userId)));
    else await tx.insert(holdings).values({ ...values, id: crypto.randomUUID(), userId, accountId: account.id, assetId: row.assetId });
  }
}
