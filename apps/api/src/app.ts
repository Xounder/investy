import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';

import authRoutes from './routes/auth.js';
import onboardingRoutes from './routes/onboarding.js';
import marketRoutes from './routes/market.js';
import assetRoutes from './routes/assets.js';
import transactionRoutes from './routes/transactions.js';
import csvImportRoutes from './routes/import-csv.js';
import notaImportRoutes from './routes/import-nota.js';
import holdingRoutes from './routes/holdings.js';
import portfolioRoutes from './routes/portfolios.js';
import brokerRoutes from './routes/brokers.js';
import accountRoutes from './routes/accounts.js';
import portfolioAggregateRoutes from './routes/portfolio-aggregates.js';

/**
 * Investy REST API (M3 — TASK-04).
 *
 * The app instance is exported separately from the server bootstrap so tests
 * can exercise routes through `app.request()` without binding a socket.
 * Business routes are mounted under /api/v1 per resource module.
 */
const app = new Hono();

// Older route helpers put a JSON envelope in the exception message. Return it
// as JSON rather than Hono's default text/plain response; leave other errors
// (including authentication responses) unchanged.
app.onError((error, c) => {
  if (error instanceof HTTPException) {
    try {
      const payload: unknown = JSON.parse(error.message);
      if (payload && typeof payload === 'object' && 'error' in payload) {
        return c.json(payload, error.status);
      }
    } catch { /* Non-JSON exceptions retain their existing response. */ }
    return error.getResponse();
  }
  console.error(error);
  return c.text('Internal Server Error', 500);
});

// CORS configuration per ADR-010: locked to app origin, credentials included
const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
app.use('*', cors({
  origin: appOrigin,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
}));

// Health check (no auth)
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Auth routes (mounted under /api/v1/auth)
app.route('/api/v1/auth', authRoutes);

// Onboarding routes (mounted under /api/v1/onboarding)
app.route('/api/v1/onboarding', onboardingRoutes);

// Market data routes (mounted under /api/v1/market)
app.route('/api/v1/market', marketRoutes);

// Asset catalog routes (mounted under /api/v1/assets)
app.route('/api/v1/assets', assetRoutes);

// Journal / transactions routes (TASK-05)
app.route('/api/v1/transactions', transactionRoutes);
app.route('/api/v1/transactions/import/csv', csvImportRoutes);
app.route('/api/v1/transactions/import/nota', notaImportRoutes);

// Holdings read-model routes (TASK-05)
app.route('/api/v1/holdings', holdingRoutes);

// Portfolio structure routes (TASK-05)
app.route('/api/v1/portfolios', portfolioRoutes);
app.route('/api/v1/brokers', brokerRoutes);
app.route('/api/v1/accounts', accountRoutes);

// Dashboard aggregate routes (TASK-05)
app.route('/api/v1/portfolio', portfolioAggregateRoutes);

export default app;
