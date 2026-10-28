import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireUser } from '../middleware/auth.js';
import { badRequest, isoDateTime, uuidId, validateQuery } from '../lib/validation.js';
import { readIncome, readPerformance, ReportWindowError } from '../repositories/reports.js';
import { loadCdiIndex } from '../services/market-data/cdi-index.js';
import { performanceReport } from '../services/reports-performance.js';

const app = new Hono();
app.use('*', authMiddleware);
const date = isoDateTime.refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use YYYY-MM-DD');
const performanceQuery = z.object({ portfolioId: uuidId, granularity: z.enum(['month', 'quarter']) }).strict();
const page = z.coerce.number().int().min(1).max(1_000_000).default(1);
const incomeQuery = z.object({ portfolioId: uuidId, from: date, to: date,
  assetPage: page, issuesPage: page }).strict();
const notFound = { error: { code: 'NOT_FOUND', message: 'Portfolio not found' } };

app.get('/performance', async (c) => {
  const { portfolioId, granularity } = validateQuery(c, performanceQuery);
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear() - 3, today.getUTCMonth(), today.getUTCDate()));
  const endExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  let data;
  try { data = await readPerformance(requireUser(c), portfolioId, start, endExclusive); }
  catch (error) {
    if (error instanceof ReportWindowError) throw badRequest('VALIDATION', error.message, ['portfolioId']);
    throw error;
  }
  if (!data) return c.json(notFound, 404);
  // CDI's bounded accumulated 3m provider window cannot imply full historic coverage.
  const cdi = await loadCdiIndex('3m');
  return c.json(performanceReport(portfolioId, granularity, data.snapshots, data.benchmarks, cdi, {
    startDate: start.toISOString().slice(0, 10), endDate: today.toISOString().slice(0, 10),
    historyBeforeWindow: data.historyBeforeWindow }));
});

app.get('/income', async (c) => {
  const { portfolioId, from, to, assetPage, issuesPage } = validateQuery(c, incomeQuery);
  if (to < from) throw badRequest('VALIDATION', 'to must be on or after from', ['to']);
  const endExclusive = new Date(`${to}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  let data;
  try { data = await readIncome(requireUser(c), portfolioId, new Date(`${from}T00:00:00.000Z`),
    endExclusive, from, to, assetPage, issuesPage); }
  catch (error) {
    if (error instanceof RangeError) throw badRequest('VALIDATION', error.message, ['from', 'to']);
    throw error;
  }
  if (!data) return c.json(notFound, 404);
  return c.json(data);
});

export default app;
