/**
 * Portfolio routes (TASK-05, design-04).
 *
 * GET    /api/v1/portfolios       — user's portfolios
 * POST   /api/v1/portfolios       — create portfolio
 * GET    /api/v1/portfolios/:id   — detail with summary
 * PATCH  /api/v1/portfolios/:id   — update
 * DELETE /api/v1/portfolios/:id   — delete (blocked when holdings/transactions exist)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

import { authMiddleware, requireUser } from '../middleware/auth.js';
import { validateBody, validateIdParam } from '../lib/validation.js';
import { serialize } from '../lib/serialize.js';
import { portfolioRepository } from '../repositories/portfolios.js';
import { accountRepository } from '../repositories/accounts.js';
import { holdingRepository } from '../repositories/holdings.js';
import { transactionRepository } from '../repositories/transactions.js';

const app = new Hono();
app.use('*', authMiddleware);

const createBodySchema = z.object({
  name: z.string().min(1).max(120),
  isDefault: z.boolean().default(false),
  currency: z.string().length(3).default('BRL'),
});

const updateBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

function notFound(): Response {
  return new HTTPException(404, {
    res: Response.json({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } }, { status: 404 }),
  }).getResponse();
}

/**
 * GET /api/v1/portfolios
 */
app.get('/', async (c) => {
  const userId = requireUser(c);
  const portfolios = await portfolioRepository.list(userId);
  return c.json({ portfolios: serialize(portfolios) });
});

/**
 * POST /api/v1/portfolios
 */
app.post('/', async (c) => {
  const userId = requireUser(c);
  const body = await validateBody(c, createBodySchema);
  const portfolio = await portfolioRepository.create({
    userId,
    name: body.name,
    isDefault: body.isDefault,
    currency: body.currency,
  });
  return c.json(serialize(portfolio), 201);
});

/**
 * GET /api/v1/portfolios/:id
 *
 * Detail with a lightweight read-model summary (accounts, holdings, cost).
 */
app.get('/:id', async (c) => {
  const userId = requireUser(c);
  const id = validateIdParam(c);

  const portfolio = await portfolioRepository.findById(id, userId);
  if (!portfolio) {
    return notFound();
  }

  const [accounts, holdings] = await Promise.all([
    accountRepository.listByPortfolio(userId, id),
    holdingRepository.list(userId, { portfolioId: id }),
  ]);

  const totalCostBasisCents = holdings.reduce((sum, h) => sum + h.costBasisCents, 0n);
  const realizedPnlCents = holdings.reduce((sum, h) => sum + h.realizedPnlCents, 0n);

  return c.json(
    serialize({
      ...portfolio,
      summary: {
        accountsCount: accounts.length,
        holdingsCount: holdings.length,
        totalCostBasisCents,
        realizedPnlCents,
        currency: 'BRL',
      },
    }),
  );
});

/**
 * PATCH /api/v1/portfolios/:id
 */
app.patch('/:id', async (c) => {
  const userId = requireUser(c);
  const id = validateIdParam(c);
  const body = await validateBody(c, updateBodySchema);

  const existing = await portfolioRepository.findById(id, userId);
  if (!existing) {
    return notFound();
  }

  if (body.isDefault === true) {
    await portfolioRepository.clearDefault(userId);
  }

  const updated = await portfolioRepository.update(id, userId, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
  });
  if (!updated) {
    return notFound();
  }
  return c.json(serialize(updated));
});

/**
 * DELETE /api/v1/portfolios/:id
 *
 * Blocked (409) while the portfolio still has holdings or transactions.
 */
app.delete('/:id', async (c) => {
  const userId = requireUser(c);
  const id = validateIdParam(c);

  const existing = await portfolioRepository.findById(id, userId);
  if (!existing) {
    return notFound();
  }

  const [hasHoldings, hasTransactions] = await Promise.all([
    holdingRepository.hasAnyForPortfolio(userId, id),
    transactionRepository.existsForPortfolio(userId, id),
  ]);
  if (hasHoldings || hasTransactions) {
    return c.json(
      {
        error: {
          code: 'PORTFOLIO_IN_USE',
          message: 'Portfolio still has holdings or transactions; remove them first',
        },
      },
      409,
    );
  }

  const deleted = await portfolioRepository.delete(id, userId);
  if (!deleted) {
    return notFound();
  }
  return c.body(null, 204);
});

export default app;
