/**
 * Asset catalog routes (design-04, M7).
 *
 * GET /api/v1/assets?search=&class=&currency=&page=
 * GET /api/v1/assets/trending
 * GET /api/v1/assets/:symbol
 * PATCH /api/v1/assets/:symbol/override
 * DELETE /api/v1/assets/:symbol/override
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import {
  authMiddleware,
  requireUser,
  optionalUser,
  getOptionalUserId,
} from '../middleware/auth.js';
import { searchAssets, getTrendingAssets, getAssetDetail } from '../services/assets/catalog.js';
import { setUserOverride, clearUserOverride } from '../services/market-data/overrides.js';
import { getDb } from '../db/client.js';
import { assets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const app = new Hono();

// Optional authentication: public endpoints that resolve user overrides when a
// valid session cookie is present, without rejecting anonymous requests.
app.use('*', optionalUser);

// Validation schemas
const assetSearchQuerySchema = z.object({
  search: z.string().optional(),
  class: z.enum([
    'acao', 'fii', 'etf', 'etf_us', 'etf_ie', 'bdr', 'crypto', 'rf', 'tesouro', 'indice'
  ]).optional(),
  currency: z.string().length(3).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const assetParamsSchema = z.object({
  symbol: z.string().min(1).max(20),
});

const overrideBodySchema = z.object({
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default('BRL'),
});

// Helper for query validation
async function validateQuery<T>(c: Context, schema: z.ZodSchema<T>): Promise<T> {
  const query = c.req.query();
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: 'VALIDATION', message: 'Invalid query parameters' } }),
    });
  }
  return parsed.data;
}

// Helper for body validation
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

// Helper for param validation
async function validateParams<T>(c: Context, schema: z.ZodSchema<T>): Promise<T> {
  const params = c.req.param();
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: JSON.stringify({ error: { code: 'VALIDATION', message: 'Invalid path parameters' } }),
    });
  }
  return parsed.data;
}

/**
 * GET /api/v1/assets?search=&class=&currency=&page=
 *
 * Paged catalog search.
 */
app.get('/', async (c) => {
  const params = await validateQuery(c, assetSearchQuerySchema);
  const result = await searchAssets(params);
  return c.json(result);
});

/**
 * GET /api/v1/assets/trending
 *
 * Returns top searched assets.
 */
app.get('/trending', async (c) => {
  const trending = await getTrendingAssets(15);
  return c.json({ assets: trending });
});

/**
 * GET /api/v1/assets/:symbol
 *
 * Catalog entity + last quote + user override (auth-optional).
 */
app.get('/:symbol', async (c) => {
  const { symbol } = await validateParams(c, assetParamsSchema);

  const userId = getOptionalUserId(c);

  const detail = await getAssetDetail(symbol, userId ?? undefined);

  if (!detail) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Asset not found in catalog' } },
      404,
    );
  }

  // Serialize BigInt fields to strings for JSON response
  const serializedDetail = {
    asset: {
      ...detail.asset,
    },
    lastQuote: detail.lastQuote ? {
      ...detail.lastQuote,
      priceCents: detail.lastQuote.priceCents.toString(),
      priceCentsBRL: detail.lastQuote.priceCentsBRL?.toString() ?? null,
    } : null,
    userOverride: detail.userOverride ? {
      ...detail.userOverride,
      priceCents: detail.userOverride.priceCents.toString(),
    } : null,
  };

  return c.json(serializedDetail);
});

/**
 * PATCH /api/v1/assets/:symbol/override
 *
 * Create/update user price override. Auth required.
 */
app.patch('/:symbol/override', authMiddleware, async (c) => {
  const userId = requireUser(c);
  const { symbol } = await validateParams(c, assetParamsSchema);
  const { priceCents, currency } = await validateBody(c, overrideBodySchema);

  // Verify asset exists
  const db = getDb();
  const [asset] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.symbol, symbol.toUpperCase()))
    .limit(1);

  if (!asset) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Asset not found in catalog' } },
      400,
    );
  }

  const override = await setUserOverride(userId, asset.id, BigInt(priceCents), currency);
  return c.json({
    symbol: symbol.toUpperCase(),
    priceCents: override.priceCents.toString(),
    currency: override.currency,
    createdAt: override.createdAt.toISOString(),
  });
});

/**
 * DELETE /api/v1/assets/:symbol/override
 *
 * Clear user price override. Auth required.
 */
app.delete('/:symbol/override', authMiddleware, async (c) => {
  const userId = requireUser(c);
  const { symbol } = await validateParams(c, assetParamsSchema);

  const db = getDb();
  const [asset] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.symbol, symbol.toUpperCase()))
    .limit(1);

  if (!asset) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Asset not found in catalog' } },
      404,
    );
  }

  const deleted = await clearUserOverride(userId, asset.id);

  if (!deleted) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'No override found for this asset' } },
      404,
    );
  }

  return c.json({ ok: true });
});

export default app;