import 'dotenv/config';

import { serve } from '@hono/node-server';

import app from './app.js';
import { brokerRepository } from './repositories/brokers.js';
import { seedAssetCatalog } from './services/assets/catalog.js';
import { initializeProviders } from './services/market-data/index.js';
import { beginBoot, completeBoot } from './routes/ready.js';

const port = Number(process.env.PORT ?? 3000);

/** Runs idempotent catalog seeds at boot (safe when DATABASE_URL is missing). */
async function runBootSeeds(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    console.log('[Boot] Skipping seeds: DATABASE_URL not set');
    return false;
  }
  try {
    console.log('[Boot] Initializing market data providers...');
    await initializeProviders();
    console.log('[Boot] Seeding broker catalog...');
    await brokerRepository.seedCatalog();
    console.log('[Boot] Seeding asset catalog...');
    await seedAssetCatalog();
    console.log('[Boot] Seeds completed');
    return true;
  } catch (error) {
    console.error('[Boot] Seed failed (non-fatal):', error instanceof Error ? error.message : String(error));
    return false;
  }
}

beginBoot();
runBootSeeds().then((seeded) => {
  if (seeded) completeBoot();
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Investy API listening on http://localhost:${info.port}`);
  });
});
