/**
 * Journal write service (TASK-05, ADR-005).
 *
 * Owns the write path for journal events: append, update, and delete all run
 * inside a single DB transaction together with the holding recompute, so a
 * failed recompute rolls back the journal write (and vice versa). Holdings are
 * always derived by replaying the full account+asset journal through the pure
 * domain engine — they are never hand-edited.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { JournalError, type TransactionType } from '@investy/domain';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getDb } from '../db/client.js';
import { accounts, assets, holdings, transactions } from '../db/schema.js';
import type { HoldingTable, TransactionTable } from '../db/schema.js';
import { replayJournalWithSales, usesMoney, validateJournalMoney } from './journal-money.js';
export { replayJournal } from './journal-money.js';

/** Structural query interface satisfied by both the db client and its transactions. */
interface Queryable {
  select: NodePgDatabase['select'];
  insert: NodePgDatabase['insert'];
  update: NodePgDatabase['update'];
  delete: NodePgDatabase['delete'];
  execute: NodePgDatabase['execute'];
}

/** Error thrown by journal write operations; routes map `code` to an HTTP status. */
export class JournalServiceError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'JOURNAL' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'JournalServiceError';
  }
}

export interface JournalWriteInput {
  userId: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  type: TransactionType;
  date: Date;
  qty: bigint;
  unitPriceCents: bigint;
  feeCents: bigint;
  fxRateToBRL?: bigint | null;
  factor?: number | null;
  amortRateCents?: bigint | null;
  notes?: string | null;
}

/** All-or-nothing import; locks accounts in a stable order and replays each touched holding once. */
export async function appendJournalBatch(
  userId: string, inputs: Array<Omit<JournalWriteInput, 'userId'>>,
  source: 'csv' | 'nota', notaRefId?: string,
  beforeInsert?: (tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]) => Promise<void>,
): Promise<{ created: number; holdings: (HoldingTable | null)[] }> {
  if (!inputs.length || inputs.length > 200) throw new JournalServiceError('VALIDATION', 'Expected 1–200 rows');
  return getDb().transaction(async (tx) => {
    for (const account of [...new Map(inputs.map((row) => [row.accountId, row])).values()]
      .sort((a, b) => a.accountId.localeCompare(b.accountId))) {
      await lockAccount(tx, userId, account.accountId, account.portfolioId);
    }
    if (beforeInsert) await beforeInsert(tx);
    const currencies = new Map<string, string>();
    for (const row of inputs) {
      const currency = currencies.get(row.assetId) ?? await requireAsset(tx, row.assetId);
      currencies.set(row.assetId, currency);
      if (usesMoney(row.type)) requireMoney(currency, row.fxRateToBRL);
      await tx.insert(transactions).values({
        id: crypto.randomUUID(), userId, portfolioId: row.portfolioId,
        accountId: row.accountId, assetId: row.assetId, type: row.type, date: row.date,
        qty: row.qty, unitPriceCents: row.unitPriceCents, feeCents: row.feeCents,
        fxRateToBRL: row.fxRateToBRL ?? null, factor: row.factor ?? null,
        amortRateCents: row.amortRateCents ?? null, notes: row.notes ?? null,
        currency, source, notaRefId: notaRefId ?? null,
      });
    }
    const touched = [...new Map(inputs.map((row) => [`${row.accountId}:${row.assetId}`, row])).values()];
    const updated = [];
    for (const row of touched) updated.push(await recomputeHolding(tx, userId, row.accountId, row.assetId));
    return { created: inputs.length, holdings: updated };
  });
}

/** Fields a journal event may be updated with after creation (design-04). */
export interface JournalUpdateInput {
  date?: Date;
  qty?: bigint;
  unitPriceCents?: bigint;
  feeCents?: bigint;
  fxRateToBRL?: bigint | null;
  factor?: number | null;
  amortRateCents?: bigint | null;
  notes?: string | null;
}

/** Historical rates, in micro-BRL per USD, supplied from the original trade records. */
export interface HistoricalFxRate {
  transactionId: string;
  fxRateToBRL: bigint;
}

/** Repairs all missing monetary FX rates for one account+asset in a single commit. */
export async function repairHistoricalFx(
  userId: string, portfolioId: string, accountId: string, assetId: string, rates: HistoricalFxRate[],
): Promise<{ repaired: number }> {
  return getDb().transaction(async (tx) => {
    await lockAccount(tx, userId, accountId, portfolioId);
    const rows = await tx.select().from(transactions).where(and(
      eq(transactions.userId, userId), eq(transactions.accountId, accountId), eq(transactions.assetId, assetId),
    ));
    const missing = rows.filter((row) => row.currency !== 'BRL' && usesMoney(row.type) && row.fxRateToBRL == null);
    const byId = new Map(rates.map((rate) => [rate.transactionId, rate.fxRateToBRL]));
    if (byId.size !== rates.length || byId.size !== missing.length ||
      missing.some((row) => !byId.has(row.id)) ||
      rates.some((rate) => rate.fxRateToBRL <= 0n)) {
      throw new JournalServiceError('VALIDATION',
        `Supply positive original historical fxRateToBRL (micro-BRL per USD) for exactly these transaction IDs: ${missing.map((row) => row.id).join(', ') || '(none)'}`);
    }
    for (const row of missing) {
      await tx.update(transactions).set({ fxRateToBRL: byId.get(row.id)! })
        .where(and(eq(transactions.id, row.id), eq(transactions.userId, userId)));
    }
    await recomputeHolding(tx, userId, accountId, assetId);
    return { repaired: missing.length };
  });
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/** Appends a journal event and recomputes the holding atomically. */
export async function appendJournalEvent(input: JournalWriteInput): Promise<TransactionTable> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockAccount(tx, input.userId, input.accountId, input.portfolioId);
    const currency = await requireAsset(tx, input.assetId);
    if (usesMoney(input.type)) requireMoney(currency, input.fxRateToBRL);

    const [row] = await tx
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        portfolioId: input.portfolioId,
        accountId: input.accountId,
        assetId: input.assetId,
        type: input.type,
        date: input.date,
        qty: input.qty,
        unitPriceCents: input.unitPriceCents,
        feeCents: input.feeCents,
        currency,
        fxRateToBRL: input.fxRateToBRL ?? null,
        factor: input.factor ?? null,
        amortRateCents: input.amortRateCents ?? null,
        source: 'manual',
        notes: input.notes ?? null,
      })
      .returning();
    if (!row) {
      throw new JournalServiceError('JOURNAL', 'Failed to create transaction');
    }

    await recomputeHolding(tx, input.userId, input.accountId, input.assetId);
    return findOwnedTransaction(tx, input.userId, row.id);
  });
}

/** Updates a journal event (limited fields) and recomputes the holding atomically. */
export async function updateJournalEvent(
  userId: string,
  transactionId: string,
  patch: JournalUpdateInput,
): Promise<TransactionTable> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await findOwnedTransaction(tx, userId, transactionId);
    await lockAccount(tx, userId, existing.accountId, existing.portfolioId);
    if (usesMoney(existing.type)) requireMoney(existing.currency ?? 'BRL', patch.fxRateToBRL === undefined ? existing.fxRateToBRL : patch.fxRateToBRL);

    const [row] = await tx
      .update(transactions)
      .set({
        ...(patch.date !== undefined ? { date: patch.date } : {}),
        ...(patch.qty !== undefined ? { qty: patch.qty } : {}),
        ...(patch.unitPriceCents !== undefined ? { unitPriceCents: patch.unitPriceCents } : {}),
        ...(patch.feeCents !== undefined ? { feeCents: patch.feeCents } : {}),
        ...(patch.fxRateToBRL !== undefined ? { fxRateToBRL: patch.fxRateToBRL } : {}),
        ...(patch.factor !== undefined ? { factor: patch.factor } : {}),
        ...(patch.amortRateCents !== undefined ? { amortRateCents: patch.amortRateCents } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
      .returning();
    if (!row) {
      throw new JournalServiceError('NOT_FOUND', 'Transaction not found');
    }

    await recomputeHolding(tx, userId, existing.accountId, existing.assetId);
    return findOwnedTransaction(tx, userId, row.id);
  });
}

/** Deletes a journal event and recomputes the holding atomically. */
export async function deleteJournalEvent(userId: string, transactionId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const existing = await findOwnedTransaction(tx, userId, transactionId);
    await lockAccount(tx, userId, existing.accountId, existing.portfolioId);

    await tx
      .delete(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
    await recomputeHolding(tx, userId, existing.accountId, existing.assetId);
  });
}

// ---------------------------------------------------------------------------
// Recompute (replay journal through the domain engine)
// ---------------------------------------------------------------------------

/**
 * Recomputes the materialized holding for an account+asset by replaying the
 * full journal. Deletes the holding when the journal leaves it empty.
 */
async function recomputeHolding(
  tx: Queryable,
  userId: string,
  accountId: string,
  assetId: string,
): Promise<HoldingTable | null> {
  const rows = await tx
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.accountId, accountId),
        eq(transactions.assetId, assetId),
      ),
    )
    .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id));

  const missing = rows.filter((row) => row.currency !== 'BRL' && usesMoney(row.type) && row.fxRateToBRL == null);
  if (missing.length) {
    throw new JournalServiceError('JOURNAL',
      `Historical FX repair required for transaction IDs: ${missing.map((row) => row.id).join(', ')}. Supply all original rates via POST /api/v1/transactions/repair-fx before writing to this holding.`);
  }

  const { holding, sales } = replayJournalWithSales(rows);
  for (const { index, realizedPnlCents } of sales) {
    const sale = rows[index]!;
    if (sale.realizedPnlCents !== realizedPnlCents) {
      await tx.update(transactions).set({ realizedPnlCents })
        .where(and(eq(transactions.id, sale.id), eq(transactions.userId, userId)));
    }
  }
  const [existing] = await tx
    .select()
    .from(holdings)
    .where(
      and(eq(holdings.userId, userId), eq(holdings.accountId, accountId), eq(holdings.assetId, assetId)),
    )
    .limit(1);

  if (rows.length === 0) {
    if (existing) {
      await tx
        .delete(holdings)
        .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)));
    }
    return null;
  }

  if (existing) {
    const [updated] = await tx
      .update(holdings)
      .set({
        qty: holding.qty,
        avgPriceCents: holding.avgPriceCents,
        costBasisCents: holding.costBasisCents,
        realizedPnlCents: holding.realizedPnlCents,
        updatedAt: new Date(),
      })
      .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
      .returning();
    return updated ?? null;
  }

  const [inserted] = await tx
    .insert(holdings)
    .values({
      id: crypto.randomUUID(),
      userId,
      accountId,
      assetId,
      qty: holding.qty,
      avgPriceCents: holding.avgPriceCents,
      costBasisCents: holding.costBasisCents,
      realizedPnlCents: holding.realizedPnlCents,
    })
    .returning();
  return inserted ?? null;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

async function findOwnedTransaction(tx: Queryable, userId: string, transactionId: string) {
  const [row] = await tx
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
    .limit(1);
  if (!row) {
    throw new JournalServiceError('NOT_FOUND', 'Transaction not found');
  }
  return row;
}

/**
 * Locks the account row for the duration of the DB transaction so concurrent
 * journal writes for the same account are serialized (edge case from the task
 * artifact). Also validates ownership and portfolio membership.
 */
async function lockAccount(tx: Queryable, userId: string, accountId: string, portfolioId: string) {
  const [account] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.portfolioId, portfolioId)),
    )
    .limit(1);
  if (!account) {
    throw new JournalServiceError('NOT_FOUND', 'Account not found');
  }
  // Advisory lock serializes journal writes per (user, account) across sessions.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`journal:${userId}:${accountId}`}::text, 0))`,
  );
}

async function requireAsset(tx: Queryable, assetId: string) {
  const [asset] = await tx
    .select({ id: assets.id, currency: assets.currency })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);
  if (!asset) {
    throw new JournalServiceError('VALIDATION', 'Asset not found');
  }
  return asset.currency ?? 'BRL';
}

function requireMoney(currency: string, fxRateToBRL: bigint | null | undefined): void {
  try { validateJournalMoney(currency, fxRateToBRL); }
  catch (error) { throw new JournalServiceError('VALIDATION', (error as Error).message); }
}

/** Maps a domain JournalError to the service error envelope (route maps to 400). */
export function mapJournalError(error: unknown): JournalServiceError | unknown {
  if (error instanceof JournalError || (error instanceof Error && error.message.includes('historical fxRateToBRL'))) {
    return new JournalServiceError('JOURNAL', error.message);
  }
  return error;
}
