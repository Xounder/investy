/**
 * Asset catalog seed script.
 *
 * Idempotent upsert of common Brazilian assets.
 * Can be run at boot or manually via CLI.
 */
import { seedAssetCatalog } from './services/assets/catalog.js';
import { initializeProviders } from './services/market-data/index.js';

async function main() {
  console.log('[Seed] Initializing provider registry...');
  initializeProviders();

  console.log('[Seed] Seeding asset catalog...');
  const count = await seedAssetCatalog();

  console.log(`[Seed] Completed: ${count} assets seeded/updated.`);
}

main().catch((error) => {
  console.error('[Seed] Failed:', error);
  process.exit(1);
});