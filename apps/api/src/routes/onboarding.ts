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
import { eq, and } from 'drizzle-orm';
import { authMiddleware, requireUser } from '../middleware/auth.js';

const app = new Hono();

const onboardingSchema = z.object({
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

    // Create default portfolio
    const portfolioId = crypto.randomUUID();
    const portfolioName = input.portfolioName ?? 'Minha Carteira';
    const [portfolio] = await db
      .insert(portfolios)
      .values({
        id: portfolioId,
        userId,
        name: portfolioName,
        isDefault: true,
        currency: 'BRL',
      })
      .returning();

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
          return c.json(
            { error: { code: 'INVALID_BROKER', message: 'Broker not found' } },
            400,
          );
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

    // If first holding provided, create asset + transaction + holding (journal-driven)
    if (input.firstHolding && accountId) {
      const { assetSymbol, assetName, assetClass, qty, unitPriceCents, feeCents = 0, date } = input.firstHolding;

      // Find or create asset
      let [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.symbol, assetSymbol)).limit(1);

      if (!asset) {
        const assetId = crypto.randomUUID();
        await db.insert(assets).values({
          id: assetId,
          symbol: assetSymbol,
          name: assetName,
          class: assetClass,
          currency: 'BRL',
        });
        asset = { id: assetId };
      }

      // Create transaction (journal entry - ADR-005)
      const transactionId = crypto.randomUUID();
      await db.insert(transactions).values({
        id: transactionId,
        userId,
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'buy',
        date: new Date(date),
        qty: BigInt(qty),
        unitPriceCents: BigInt(unitPriceCents),
        feeCents: BigInt(feeCents),
        source: 'onboarding',
      });

      // Create/update holding (materialized view)
      const costBasisCents = BigInt(qty) * BigInt(unitPriceCents) + BigInt(feeCents);
      const avgPriceCents = costBasisCents / BigInt(qty);

      const [existingHolding] = await db
        .select()
        .from(holdings)
        .where(and(eq(holdings.accountId, accountId), eq(holdings.assetId, asset.id)))
        .limit(1);

      if (existingHolding) {
        const newQty = existingHolding.qty + BigInt(qty);
        const newCostBasis = existingHolding.costBasisCents + costBasisCents;
        const newAvgPrice = newCostBasis / newQty;

        await db
          .update(holdings)
          .set({
            qty: newQty,
            avgPriceCents: newAvgPrice,
            costBasisCents: newCostBasis,
            updatedAt: new Date(),
          })
          .where(eq(holdings.id, existingHolding.id));
      } else {
        await db.insert(holdings).values({
          id: crypto.randomUUID(),
          userId,
          accountId,
          assetId: asset.id,
          qty: BigInt(qty),
          avgPriceCents,
          costBasisCents,
          realizedPnlCents: 0n,
        });
      }
    }

    return c.json({ portfolioId: portfolio.id, accountId }, 201);
  },
);

export default app;