/**
 * Account routes (TASK-05, design-04).
 *
 * GET    /api/v1/accounts?portfolioId= — user accounts for a portfolio
 * POST   /api/v1/accounts              — create account
 * PATCH  /api/v1/accounts/:id          — update
 * DELETE /api/v1/accounts/:id          — delete (blocked when transactions exist)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

import { authMiddleware, requireUser } from '../middleware/auth.js';
import { badRequest, validateBody, validateQuery, validateIdParam, uuidId } from '../lib/validation.js';
import { serialize } from '../lib/serialize.js';
import { accountRepository } from '../repositories/accounts.js';
import { portfolioRepository } from '../repositories/portfolios.js';
import { brokerRepository } from '../repositories/brokers.js';
import { transactionRepository } from '../repositories/transactions.js';

const app = new Hono();
app.use('*', authMiddleware);

const listQuerySchema = z.object({
  portfolioId: uuidId,
});

const createBodySchema = z.object({
  portfolioId: uuidId,
  brokerId: uuidId,
  name: z.string().min(1).max(120),
  accountNumber: z.string().max(60).nullable().optional(),
});

const updateBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    accountNumber: z.string().max(60).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

function notFound(): Response {
  return new HTTPException(404, {
    res: Response.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, { status: 404 }),
  }).getResponse();
}

/**
 * GET /api/v1/accounts?portfolioId=
 *
 * Lists the user's accounts for one portfolio. The portfolio must belong
 * to the session user (cross-user returns 404).
 */
app.get('/', async (c) => {
  const userId = requireUser(c);
  const q = validateQuery(c, listQuerySchema);

  const portfolio = await portfolioRepository.findById(q.portfolioId, userId);
  if (!portfolio) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } }, 404);
  }

  const accounts = await accountRepository.listByPortfolio(userId, q.portfolioId);
  return c.json({ accounts: serialize(accounts) });
});

/**
 * POST /api/v1/accounts
 */
app.post('/', async (c) => {
  const userId = requireUser(c);
  const body = await validateBody(c, createBodySchema);

  const portfolio = await portfolioRepository.findById(body.portfolioId, userId);
  if (!portfolio) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } }, 404);
  }

  const broker = await brokerRepository.findById(body.brokerId);
  if (!broker) {
    throw badRequest('INVALID_BROKER', 'Broker not found');
  }

  const account = await accountRepository.create({
    userId,
    portfolioId: body.portfolioId,
    brokerId: body.brokerId,
    name: body.name,
    accountNumber: body.accountNumber ?? null,
  });
  return c.json(serialize(account), 201);
});

/**
 * PATCH /api/v1/accounts/:id
 */
app.patch('/:id', async (c) => {
  const userId = requireUser(c);
  const id = validateIdParam(c);
  const body = await validateBody(c, updateBodySchema);

  const updated = await accountRepository.update(id, userId, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.accountNumber !== undefined ? { accountNumber: body.accountNumber } : {}),
  });
  if (!updated) {
    return notFound();
  }
  return c.json(serialize(updated));
});

/**
 * DELETE /api/v1/accounts/:id
 *
 * Blocked (409) while the account still has journal transactions.
 */
app.delete('/:id', async (c) => {
  const userId = requireUser(c);
  const id = validateIdParam(c);

  const existing = await accountRepository.findById(id, userId);
  if (!existing) {
    return notFound();
  }

  const hasTransactions = await transactionRepository.existsForAccount(userId, id);
  if (hasTransactions) {
    return c.json(
      {
        error: {
          code: 'ACCOUNT_IN_USE',
          message: 'Account still has transactions; remove them first',
        },
      },
      409,
    );
  }

  const deleted = await accountRepository.delete(id, userId);
  if (!deleted) {
    return notFound();
  }
  return c.body(null, 204);
});

export default app;
