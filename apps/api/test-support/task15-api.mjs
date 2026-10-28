import { Client } from 'pg';
import process from 'node:process';
import { URL } from 'node:url';

const url = process.env.E2E_DATABASE_URL;
if (!url) throw new Error('E2E_DATABASE_URL is required; refusing to use DATABASE_URL');
let database;
try { database = new URL(url); } catch { throw new Error('E2E_DATABASE_URL must be a valid PostgreSQL URL'); }
if (!['postgres:', 'postgresql:'].includes(database.protocol) || !/(?:^|[_-])test(?:$|[_-])|(?:^|[_-])e2e(?:$|[_-])/i.test(decodeURIComponent(database.pathname.slice(1)))) {
  throw new Error('E2E_DATABASE_URL must name a dedicated database containing test or e2e');
}
const client = new Client({ connectionString: url });
try {
  await client.connect();
  const result = await client.query("SELECT to_regclass('public.users') AS users, to_regclass('public.portfolios') AS portfolios, to_regclass('public.assets') AS assets");
  if (!result.rows[0]?.users || !result.rows[0]?.portfolios || !result.rows[0]?.assets) {
    throw new Error('Isolated E2E database has not been migrated; run pnpm db:migrate in apps/api with DATABASE_URL set to E2E_DATABASE_URL');
  }
} catch (error) {
  throw new Error(`E2E database preflight failed: ${error instanceof Error && error.message.startsWith('Isolated E2E') ? error.message : 'connection or schema unavailable'}`);
} finally { await client.end(); }

process.env.DATABASE_URL = url;
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.PORT = '3000';
const { installExternalFixtures } = await import('./task15-provider-fixtures.mjs');
installExternalFixtures();
await import('../dist/index.js');
