/**
 * Broker routes (TASK-05, design-04).
 *
 * GET  /api/v1/brokers — seeded broker catalog (auto-seeds when empty)
 * POST /api/v1/brokers — custom broker
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

import { authMiddleware, requireUser } from '../middleware/auth.js';
import { validateBody } from '../lib/validation.js';
import { serialize } from '../lib/serialize.js';
import { brokerRepository } from '../repositories/brokers.js';

const app = new Hono();
app.use('*', authMiddleware);

const createBodySchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40).optional(),
  url: z.string().max(255).optional(),
});

/**
 * GET /api/v1/brokers
 *
 * Returns the seeded catalog, seeding it on first access so the list is
 * never empty for new deployments.
 */
app.get('/', async (c) => {
  requireUser(c);
  let brokers = await brokerRepository.list();
  if (brokers.length === 0) {
    brokers = await brokerRepository.seedCatalog();
  }
  return c.json({ brokers: serialize(brokers) });
});

/**
 * POST /api/v1/brokers
 *
 * Creates a custom (non-seeded) broker. A duplicate code returns 409.
 */
app.post('/', async (c) => {
  requireUser(c);
  const body = await validateBody(c, createBodySchema);

  if (body.code) {
    const existing = await brokerRepository.findByCode(body.code);
    if (existing) {
      throw new HTTPException(409, {
        message: JSON.stringify({
          error: { code: 'DUPLICATE_CODE', message: 'A broker with this code already exists' },
        }),
      });
    }
  }

  const broker = await brokerRepository.create({
    id: crypto.randomUUID(),
    name: body.name,
    code: body.code ?? null,
    url: body.url ?? null,
    isSeeded: false,
  });
  return c.json(serialize(broker), 201);
});

export default app;
