import { Hono } from 'hono';
import { cors } from 'hono/cors';

import authRoutes from './routes/auth.js';
import onboardingRoutes from './routes/onboarding.js';
import marketRoutes from './routes/market.js';
import assetRoutes from './routes/assets.js';

/**
 * Investy REST API (M3 — TASK-04).
 *
 * The app instance is exported separately from the server bootstrap so tests
 * can exercise routes through `app.request()` without binding a socket.
 * Business routes are mounted under /api/v1 per resource module.
 */
const app = new Hono();

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

export default app;