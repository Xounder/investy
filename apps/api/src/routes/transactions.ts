/**
 * Transactions / journal routes (TASK-05, ADR-005, design-04).
 *
 * GET    /api/v1/transactions             — filtered, paged, ownership-scoped
 * POST   /api/v1/transactions             — append journal event + recompute (atomic)
 * PATCH  /api/v1/transactions/:id         — limited-field update + recompute
 * DELETE /api/v1/transactions/:id         — delete + recompute
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

import { authMiddleware, requireUser } from '../middleware/auth.js';
import { validateBody, validateQuery, validateIdParam, isoDateTime, pageSchema, uuidId, nonnegativeBigInt } from '../lib/validation.js';
import { serialize } from '../lib/serialize.js';
import { transactionRepository } from '../repositories/transactions.js';
import { accountRepository } from '../repositories/accounts.js';
import {
  appendJournalEvent,
  updateJournalEvent,
  deleteJournalEvent,
  mapJournalError,
  JournalServiceError,
  repairHistoricalFx,
} from '../services/journal.js';

const app = new Hono();
app.use('*', authMiddleware);

const TRANSACTION_TYPES = [
  'buy',
  'sell',
  'split',
  'bonificacao',
  'dividend',
  'jcp',
  'amortizacao',
  'adjustment',
  'opening',
] as const;

const listQuerySchema = z.object({
  portfolioId: uuidId.optional(),
  accountId: uuidId.optional(),
  assetId: uuidId.optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  page: pageSchema,
});

const createBodySchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  date: isoDateTime,
  accountId: uuidId,
  assetId: uuidId,
  qty: nonnegativeBigInt,
  unitPriceCents: nonnegativeBigInt,
  feeCents: nonnegativeBigInt.default(0),
  fxRateToBRL: nonnegativeBigInt.optional(),
  factor: z.number().int().safe().positive().optional(),
  amortRateCents: nonnegativeBigInt.optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateBodySchema = z
  .object({
    date: isoDateTime.optional(),
    qty: nonnegativeBigInt.optional(),
    unitPriceCents: nonnegativeBigInt.optional(),
    feeCents: nonnegativeBigInt.optional(),
    fxRateToBRL: nonnegativeBigInt.nullable().optional(),
    factor: z.number().int().safe().positive().nullable().optional(),
    amortRateCents: nonnegativeBigInt.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

const repairFxBodySchema = z.object({
  accountId: uuidId,
  assetId: uuidId,
  rates: z.array(z.object({ transactionId: uuidId, fxRateToBRL: nonnegativeBigInt })).min(1),
});

/** Maps journal service errors to HTTP responses (404 for cross-user, 400 otherwise). */
function rethrowJournalError(error: unknown): never {
  const mapped = mapJournalError(error);
  if (mapped instanceof JournalServiceError) {
    const status = mapped.code === 'NOT_FOUND' ? 404 : mapped.code === 'CONFLICT' ? 409 : 400;
    throw new HTTPException(status, {
      res: Response.json({ error: { code: mapped.code, message: mapped.message } }, { status }),
    });
  }
  throw error;
}

/**
 * GET /api/v1/transactions
 *
 * Filtered, paged journal listing scoped to the session user.
 */
app.get('/', async (c) => {
  const userId = requireUser(c);
  const q = validateQuery(c, listQuerySchema);

  const { items, hasMore } = await transactionRepository.listPaged(
    userId,
    {
      portfolioId: q.portfolioId,
      accountId: q.accountId,
      assetId: q.assetId,
      type: q.type,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    },
    q.page,
  );

  return c.json({
    items: serialize(items),
    page: q.page,
    hasMore,
  });
});

/**
 * POST /api/v1/transactions
 *
 * Appends a journal event and recomputes the holding atomically (ADR-005).
 * The portfolio is resolved from the account, which must belong to the user.
 */
app.post('/', async (c) => {
  const userId = requireUser(c);
  const body = await validateBody(c, createBodySchema);

  const account = await accountRepository.findById(body.accountId, userId);
  if (!account) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404);
  }

  try {
    const transaction = await appendJournalEvent({
      userId,
      portfolioId: account.portfolioId,
      accountId: account.id,
      assetId: body.assetId,
      type: body.type,
      date: new Date(body.date),
      qty: body.qty,
      unitPriceCents: body.unitPriceCents,
      feeCents: body.feeCents,
      fxRateToBRL: body.fxRateToBRL,
      factor: body.factor ?? null,
      amortRateCents: body.amortRateCents ?? null,
      notes: body.notes ?? null,
    });
    return c.json(serialize(transaction), 201);
  } catch (error) {
    rethrowJournalError(error);
  }
});

/** All missing original FX rates for an account+asset must be supplied together. */
app.post('/repair-fx', async (c) => {
  const userId = requireUser(c);
  const body = await validateBody(c, repairFxBodySchema);
  const account = await accountRepository.findById(body.accountId, userId);
  if (!account) return c.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404);
  try {
    return c.json(await repairHistoricalFx(userId, account.portfolioId, account.id, body.assetId, body.rates));
  } catch (error) {
    rethrowJournalError(error);
  }
});

/**
 * PATCH /api/v1/transactions/:id
 *
 * Updates limited journal fields and recomputes the holding atomically.
 * Cross-user access returns 404 (ADR-006).
 */
app.patch('/:id', async (c) => {
  const userId = requireUser(c);
  const id = validateIdParam(c);
  const body = await validateBody(c, updateBodySchema);

  try {
    const updated = await updateJournalEvent(userId, id, {
      date: body.date !== undefined ? new Date(body.date) : undefined,
      qty: body.qty,
      unitPriceCents: body.unitPriceCents,
      feeCents: body.feeCents,
      fxRateToBRL: body.fxRateToBRL,
      factor: body.factor,
      amortRateCents:
        body.amortRateCents !== undefined
          ? body.amortRateCents
          : undefined,
      notes: body.notes,
    });
    return c.json(serialize(updated));
  } catch (error) {
    rethrowJournalError(error);
  }
});

/**
 * DELETE /api/v1/transactions/:id
 *
 * Removes the journal event and recomputes the holding atomically.
 */
app.delete('/:id', async (c) => {
  const userId = requireUser(c);
  const id = validateIdParam(c);

  try {
    await deleteJournalEvent(userId, id);
    return c.body(null, 204);
  } catch (error) {
    rethrowJournalError(error);
  }
});

export default app;
