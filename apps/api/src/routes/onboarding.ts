/**
 * Onboarding route (ADR-005, design-04).
 *
 * POST /api/v1/onboarding
 * Creates a default portfolio + optional broker + optional first holding.
 * Returns 201 on success. Invalid brokerId returns 400.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { getDb } from '../db/client.js';
import { portfolios, brokers, accounts, assets, transactions, holdings } from '../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { authMiddleware, requireUser } from '../middleware/auth.js';
import { replayJournal } from '../services/journal-money.js';

const app = new Hono();

const onboardingSchema = z.object({
  portfolioId: z.string().uuid().optional(),
  portfolioName: z.string().min(1).max(120).default('Minha Carteira'),
  brokerId: z.string().optional(),
  brokerName: z.string().min(1).max(120).optional(),
  brokerCode: z.string().max(40).optional(),
  accountName: z.string().min(1).max(120).optional(),
  accountNumber: z.string().max(60).optional(),
  // Optional first holding (journal-driven per ADR-005)
  firstHolding: z
    .object({
      assetSymbol: z.string().min(1).max(20),
      assetName: z.string().min(1).max(160),
      assetClass: z.enum([
        'acao',
        'fii',
        'etf',
        'etf_us',
        'etf_ie',
        'bdr',
        'crypto',
        'rf',
        'tesouro',
        'indice',
      ]),
      qty: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
      feeCents: z.number().int().nonnegative().default(0),
      date: z.string().datetime(),
    })
    .optional(),
});

// Helper for inline validation
async function validateBody<T>(c: Context, schema: z.ZodSchema<T>): Promise<T> {
  const body = await c.req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: 'VALIDATION', message: 'Invalid request body' } }),
    });
  }
  return parsed.data;
}

app.post(
  '/',
  authMiddleware,
  async (c) => {
    const userId = requireUser(c);
    const input = await validateBody(c, onboardingSchema);
    const db = getDb();
    if (input.firstHolding && !input.brokerId && !input.brokerName) {
      return c.json({ error: { code: 'BROKER_REQUIRED', message: 'Broker required for first holding' } }, 400);
    }
    // Validate shared catalog references before any write; the transaction also
    // protects the entire bootstrap from later account/journal write failures.
    if (input.brokerId && typeof db.transaction === 'function') {
      const [broker] = await db.select({ id: brokers.id }).from(brokers).where(eq(brokers.id, input.brokerId)).limit(1);
      if (!broker) return c.json({ error: { code: 'INVALID_BROKER', message: 'Broker not found' } }, 400);
    }

    type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
    const bootstrap = async (tx: Tx) => {
    const db = tx;

    // Reuse an existing owner portfolio without changing its attributes, or
    // create the default portfolio for a new user's first bootstrap.
    const portfolioId = input.portfolioId ?? crypto.randomUUID();
    const [portfolio] = input.portfolioId
      ? await db.select({ id: portfolios.id }).from(portfolios).where(and(
        eq(portfolios.id, portfolioId), eq(portfolios.userId, userId),
      )).limit(1)
      : await db.insert(portfolios).values({
        id: portfolioId, userId, name: input.portfolioName ?? 'Minha Carteira',
        isDefault: true, currency: 'BRL',
      }).returning();

    if (!portfolio && input.portfolioId) throw new Error('PORTFOLIO_NOT_FOUND');
    if (!portfolio) {
      throw new Error('Failed to create portfolio');
    }

    let accountId: string | undefined;

    // If broker provided, create or find broker and create account
    if (input.brokerId || input.brokerName) {
      let brokerId = input.brokerId;

      if (brokerId) {
        // Verify broker exists
        const [broker] = await db.select({ id: brokers.id }).from(brokers).where(eq(brokers.id, brokerId)).limit(1);
        if (!broker) {
          throw new Error('INVALID_BROKER');
        }
      } else {
        // Create new broker (custom)
        brokerId = crypto.randomUUID();
        await db.insert(brokers).values({
          id: brokerId,
          name: input.brokerName!,
          code: input.brokerCode ?? input.brokerName!.toLowerCase().replace(/\s+/g, '-'),
          isSeeded: false,
        });
      }

      // Create account
      accountId = crypto.randomUUID();
      await db.insert(accounts).values({
        id: accountId,
        userId,
        portfolioId,
        brokerId,
        name: input.accountName ?? 'Conta Principal',
        accountNumber: input.accountNumber ?? null,
      });
    }

    // The first holding is a replay of the initial journal event, not independent arithmetic.
    if (input.firstHolding && accountId) {
      const { assetSymbol, assetName, assetClass, qty, unitPriceCents, feeCents = 0, date } = input.firstHolding;

      // Find or create asset
      // assets.currency is NOT NULL in PostgreSQL, so this comparison yields a
      // non-null boolean for every stored currency (including EUR or USD).
      let [asset] = await db.select({
        id: assets.id,
        requiresHistoricalFx: sql<boolean>`${assets.currency} <> 'BRL'`,
      }).from(assets).where(eq(assets.symbol, assetSymbol)).limit(1);

      if (!asset) {
        const assetId = crypto.randomUUID();
        await db.insert(assets).values({
          id: assetId,
          symbol: assetSymbol,
          name: assetName,
          class: assetClass,
          currency: 'BRL',
        });
        asset = { id: assetId, requiresHistoricalFx: false };
      }

      // The bootstrap contract has no historical FX input. Do not silently
      // book an existing USD asset as BRL or invent a historical exchange rate.
      if (asset.requiresHistoricalFx) throw new Error('ONBOARDING_FX_REQUIRED');

      const event = {
        type: 'buy' as const, date: new Date(date), qty: BigInt(qty),
        unitPriceCents: BigInt(unitPriceCents), feeCents: BigInt(feeCents),
        currency: 'BRL', fxRateToBRL: null, factor: null, amortRateCents: null,
      };
      const transactionId = crypto.randomUUID();
      await db.insert(transactions).values({
        id: transactionId,
        userId,
        portfolioId,
        accountId,
        assetId: asset.id,
        type: event.type,
        date: event.date,
        qty: event.qty,
        unitPriceCents: event.unitPriceCents,
        feeCents: event.feeCents,
        currency: event.currency,
        source: 'onboarding',
      });

      const holding = replayJournal([event]);
      await db.insert(holdings).values({
        id: crypto.randomUUID(), userId, accountId, assetId: asset.id,
        qty: holding.qty, avgPriceCents: holding.avgPriceCents,
        costBasisCents: holding.costBasisCents, realizedPnlCents: holding.realizedPnlCents,
      });
    }

    return { portfolioId: portfolio.id, accountId };
    };
    try {
      const created = typeof db.transaction === 'function'
        ? await db.transaction(bootstrap) : await bootstrap(db as unknown as Tx);
      return c.json(created, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'PORTFOLIO_NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } }, 404);
      }
      if (error instanceof Error && error.message === 'INVALID_BROKER') {
        return c.json({ error: { code: 'INVALID_BROKER', message: 'Broker not found' } }, 400);
      }
      if (error instanceof Error && error.message === 'ONBOARDING_FX_REQUIRED') {
        return c.json({ error: { code: 'FX_REQUIRED', message: 'Non-BRL first holding requires a historical FX rate; use the transaction endpoint' } }, 400);
      }
      throw error;
    }
  },
);

export default app;
