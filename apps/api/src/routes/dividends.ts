import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { authMiddleware, requireUser } from '../middleware/auth.js';
import { badRequest, isoDateTime, nonnegativeBigInt, uuidId, validateBody, validateIdParam, validateQuery } from '../lib/validation.js';
import { createDividend, DividendError, listAgenda, listHistory, updateDividend } from '../services/dividends.js';

const app = new Hono();
app.use('*', authMiddleware);
const date = isoDateTime.refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), 'Use YYYY-MM-DD');
const agendaQuery = z.object({ from: date, to: date });
const historyQuery = z.object({ year: z.coerce.number().int().min(1).max(9999),
  month: z.coerce.number().int().min(1).max(12).optional() });
const createBody = z.object({ assetId: uuidId, portfolioId: uuidId,
  kind: z.enum(['dividend', 'jcp', 'rendimento', 'amortizacao']), exDate: date,
  paymentDate: date.nullable().optional(), rateCentsPerUnit: nonnegativeBigInt.refine((v) => v > 0n) }).strict();
const patchBody = z.object({ status: z.enum(['confirmed', 'paid']).optional(), paymentDate: date.optional(),
  fxRateToBRL: nonnegativeBigInt.refine((rate) => rate > 0n, 'Must be positive').optional() })
  .strict().refine((value) => value.status || value.paymentDate, 'Supply status or paymentDate');

function handle(error: unknown): never {
  if (error instanceof DividendError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
    throw new HTTPException(status, { res: Response.json({ error: { code: error.code, message: error.message } }, { status }) });
  }
  throw error;
}

app.get('/agenda', async (c) => {
  const { from, to } = validateQuery(c, agendaQuery);
  if (to < from) throw badRequest('VALIDATION', 'to must be on or after from');
  return c.json(await listAgenda(requireUser(c), new Date(from), new Date(to)));
});

app.get('/history', async (c) => {
  const { year, month } = validateQuery(c, historyQuery);
  return c.json(await listHistory(requireUser(c), year, month));
});

app.post('/', async (c) => {
  const input = await validateBody(c, createBody);
  if (input.paymentDate && input.paymentDate <= input.exDate) throw badRequest('VALIDATION', 'Payment date must be after ex-date');
  try {
    return c.json(await createDividend(requireUser(c), { ...input,
      exDate: new Date(input.exDate), paymentDate: input.paymentDate ? new Date(input.paymentDate) : null }), 201);
  } catch (error) { return handle(error); }
});

app.patch('/:id', async (c) => {
  const id = validateIdParam(c);
  const patch = await validateBody(c, patchBody);
  try {
    return c.json(await updateDividend(requireUser(c), id,
      { status: patch.status, paymentDate: patch.paymentDate ? new Date(patch.paymentDate) : undefined,
        fxRateToBRL: patch.fxRateToBRL }));
  } catch (error) { return handle(error); }
});

export default app;
