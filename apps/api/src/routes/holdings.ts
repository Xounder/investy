/**
 * Holdings routes (TASK-05, design-04). Read-only — holdings are derived
 * from the journal and never edited directly (ADR-005).
 *
 * GET /api/v1/holdings?portfolioId=&accountId= — materialized holdings + live BRL valuation
 * GET /api/v1/holdings/:assetId                — position detail (lots, quote, events)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

import { authMiddleware, requireUser } from '../middleware/auth.js';
import { validateQuery, validateIdParam, uuidId } from '../lib/validation.js';
import { serialize } from '../lib/serialize.js';
import { holdingRepository } from '../repositories/holdings.js';
import { transactionRepository } from '../repositories/transactions.js';
import { computeValuations } from '../services/valuation.js';
import { buildHoldingLots } from '../services/holding-lots.js';

const app = new Hono();
app.use('*', authMiddleware);

const listQuerySchema = z.object({
  portfolioId: uuidId.optional(),
  accountId: uuidId.optional(),
});

/** Shapes a holding row with its valuation into the API response contract. */
function toHoldingResponse(
  holding: Awaited<ReturnType<typeof holdingRepository.list>>[number],
  valuation: import('../services/valuation.js').HoldingValuation | undefined,
) {
  return {
    id: holding.id,
    accountId: holding.accountId,
    assetId: holding.assetId,
    symbol: holding.asset.symbol,
    assetName: holding.asset.name,
    assetClass: holding.asset.class,
    sector: holding.asset.sector,
    assetCurrency: holding.asset.currency,
    qty: holding.qty,
    avgPriceCents: holding.avgPriceCents,
    costBasisCents: holding.costBasisCents,
    realizedPnlCents: holding.realizedPnlCents,
    priceCents: valuation?.priceCents ?? null,
    dayChangePercent: valuation?.dayChangePercent ?? null,
    priceCentsBRL: valuation?.priceCentsBRL ?? null,
    marketValueCentsBRL: valuation?.marketValueCentsBRL ?? null,
    unrealizedPnlCentsBRL: valuation?.unrealizedPnlCentsBRL ?? null,
    isStale: valuation?.isStale ?? false,
    isOverride: valuation?.isOverride ?? false,
    currency: 'BRL' as const,
  };
}

/**
 * GET /api/v1/holdings?portfolioId=&accountId=
 *
 * Materialized holdings with live BRL valuation (override > stale quote).
 */
app.get('/', async (c) => {
  const userId = requireUser(c);
  const q = validateQuery(c, listQuerySchema);

  const holdings = await holdingRepository.list(userId, {
    portfolioId: q.portfolioId,
    accountId: q.accountId,
  });
  const valuations = await computeValuations(userId, holdings);

  return c.json({
    holdings: serialize(holdings.map((h) => toHoldingResponse(h, valuations.get(h.id)))),
  });
});

/**
 * GET /api/v1/holdings/:assetId
 *
 * Position detail across all of the user's accounts: aggregated summary,
  * per-account positions, the effective quote, open display lots, and events.
 */
app.get('/:assetId', async (c) => {
  const userId = requireUser(c);
  const assetId = validateIdParam(c, 'assetId');

  const holdings = await holdingRepository.listByAsset(userId, assetId);
  const firstHolding = holdings[0];
  if (!firstHolding) {
    throw new HTTPException(404, {
      message: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No position for this asset' } }),
    });
  }

  const valuations = await computeValuations(userId, holdings);

  const eventsPerAccount = await Promise.all(
    holdings.map((h) => transactionRepository.listForHolding(userId, h.accountId, assetId)),
  );
  const lots = buildHoldingLots(holdings.map((h, index) => ({
    accountId: h.accountId, qty: h.qty, costBasisCents: h.costBasisCents, events: eventsPerAccount[index]!,
  })));

  const totalQty = holdings.reduce((sum, h) => sum + h.qty, 0n);
  const totalCostBasisCents = holdings.reduce((sum, h) => sum + h.costBasisCents, 0n);
  const totalRealizedPnlCents = holdings.reduce((sum, h) => sum + h.realizedPnlCents, 0n);
  const firstValuation = valuations.get(firstHolding.id);

  return c.json(
    serialize({
      asset: firstHolding.asset,
      summary: {
        qty: totalQty,
        costBasisCents: totalCostBasisCents,
        realizedPnlCents: totalRealizedPnlCents,
        priceCentsBRL: firstValuation?.priceCentsBRL ?? null,
        dayChangePercent: firstValuation?.dayChangePercent ?? null,
        marketValueCentsBRL:
          firstValuation?.priceCentsBRL != null ? totalQty * firstValuation.priceCentsBRL : null,
        currency: 'BRL' as const,
      },
      positions: holdings.map((h) => ({
        accountId: h.accountId,
        qty: h.qty,
        avgPriceCents: h.avgPriceCents,
        costBasisCents: h.costBasisCents,
        realizedPnlCents: h.realizedPnlCents,
      })),
      quote: firstValuation ?? null,
      lots,
      events: eventsPerAccount.flat(),
    }),
  );
});

export default app;
