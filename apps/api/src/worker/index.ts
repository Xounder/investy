import 'dotenv/config';
import { closeDb } from '../db/client.js';
import { initializeProviders } from '../services/market-data/index.js';
import { CLOSE_QUOTE_REFRESH, createScheduler, SCHEDULES } from './scheduler.js';
import { refreshQuotes } from './jobs/quote-refresh.js';
import { captureClose } from './jobs/snapshot.js';
import { syncDividendAgenda } from './jobs/dividend-sync.js';
import { backupAllOwners } from './jobs/backup.js';
import { backfillSnapshots } from './jobs/backfill.js';
import { runBenchmarkJob } from './jobs/benchmark-sync.js';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to start the worker');
  await initializeProviders();
  const scheduler = createScheduler({ quotes: refreshQuotes, snapshots: captureClose,
    dividends: syncDividendAgenda, backups: backupAllOwners, backfill: backfillSnapshots,
    benchmarks: runBenchmarkJob });
  scheduler.start();
  console.info('[Worker] Started (America/Sao_Paulo)', SCHEDULES, CLOSE_QUOTE_REFRESH);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void scheduler.stop().then(() => closeDb()).then(() => { process.exitCode = 0; }, (error: unknown) => {
      console.error('[Worker] Shutdown failed:', error);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

void main().catch((error: unknown) => { console.error('[Worker] Startup failed:', error); process.exitCode = 1; });
