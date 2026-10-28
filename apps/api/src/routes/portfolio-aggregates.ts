/**
 * Portfolio aggregate routes (TASK-05, design-04 dashboard hub).
 *
 * GET /api/v1/portfolio/summary?portfolioId=    — totals, cost, unrealized, realized
 * GET /api/v1/portfolio/allocation?portfolioId= — byClass / bySector percentages
 * GET /api/v1/portfolio/snapshots?portfolioId=&range= — daily snapshots
 *
 * Summary and allocation are computed on read from holdings + live valuations;
 * snapshots are the only stored aggregate (written by the worker, TASK-10).
 */
import { Hono } from 'hono';
import { z } from 'zod';

import { authMiddleware, requireUser } from '../middleware/auth.js';
import { validateQuery, uuidId } from '../lib/validation.js';
import { serialize } from '../lib/serialize.js';
import { portfolioRepository } from '../repositories/portfolios.js';
import { holdingRepository } from '../repositories/holdings.js';
import { snapshotRepository } from '../repositories/snapshots.js';
import { computeValuations } from '../services/valuation.js';
import { computeSummary, computeAllocation } from '../services/portfolio-summary.js';
import { compareSummary } from '../services/summary-comparison.js';

const app = new Hono();
app.use('*', authMiddleware);

const portfolioIdSchema = z.object({ portfolioId: uuidId });
const summaryQuerySchema = z.object({ portfolioId: uuidId.optional() });

const snapshotsQuerySchema = portfolioIdSchema.extend({
  range: z.enum(['1m', '3m', '6m', '1y', 'all']).default('1y'),
});

const RANGE_DAYS: Record<'1m' | '3m' | '6m' | '1y', number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
};

async function requireOwnedPortfolio(userId: string, portfolioId: string) {
  const portfolio = await portfolioRepository.findById(portfolioId, userId);
  if (!portfolio) {
    return null;
  }
  return portfolio;
}

/**
 * GET /api/v1/portfolio/summary?portfolioId=
 */
app.get('/summary', async (c) => {
  const userId = requireUser(c);
  const q = validateQuery(c, summaryQuerySchema);

  const portfolios = q.portfolioId
    ? await requireOwnedPortfolio(userId, q.portfolioId).then(p => p ? [p] : [])
    : await portfolioRepository.list(userId);
  if (q.portfolioId && portfolios.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } }, 404);
  }

  const holdings = await holdingRepository.list(userId, q.portfolioId ? { portfolioId: q.portfolioId } : {});
  const valuations = await computeValuations(userId, holdings);
  const summary = computeSummary(holdings, valuations);
  const allocation = computeAllocation(holdings, valuations);
  const now = new Date();
  // Calendar-date filtering belongs in the service (timezone-aware, including historical DST).
  const snapshots = await snapshotRepository.listPrior(userId, portfolios.map(p => p.id), now);
  const comparison = compareSummary(summary, holdings, valuations, portfolios.map(p => p.id), snapshots, now);

  return c.json(serialize({ ...summary, allocation, comparison }));
});

/**
 * GET /api/v1/portfolio/allocation?portfolioId=
 */
app.get('/allocation', async (c) => {
  const userId = requireUser(c);
  const q = validateQuery(c, portfolioIdSchema);

  const portfolio = await requireOwnedPortfolio(userId, q.portfolioId);
  if (!portfolio) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } }, 404);
  }

  const holdings = await holdingRepository.list(userId, { portfolioId: q.portfolioId });
  const valuations = await computeValuations(userId, holdings);
  return c.json(serialize(computeAllocation(holdings, valuations)));
});

/**
 * GET /api/v1/portfolio/snapshots?portfolioId=&range=
 *
 * Daily snapshots retained indefinitely (design-06); empty range → [].
 */
app.get('/snapshots', async (c) => {
  const userId = requireUser(c);
  const q = validateQuery(c, snapshotsQuerySchema);

  const portfolio = await requireOwnedPortfolio(userId, q.portfolioId);
  if (!portfolio) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } }, 404);
  }

  let fromDate: Date | null = null;
  if (q.range !== 'all') {
    const days = RANGE_DAYS[q.range as '1m' | '3m' | '6m' | '1y'];
    fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  const snapshots = await snapshotRepository.listSince(userId, q.portfolioId, fromDate);
  return c.json({ snapshots: serialize(snapshots) });
});

export default app;
