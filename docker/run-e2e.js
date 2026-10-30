import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

let privateText = '';
let password = '';
let internalUrl = '';
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
function redact(message) {
  let output = String(message);
  for (const secret of [privateText.trim(), password, internalUrl]) {
    if (secret) output = output.replaceAll(secret, '[REDACTED]');
  }
  return output.replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED DATABASE URL]');
}

async function verifyMigrations() {
  const { Client } = apiRequire('pg');
  const client = new Client({ connectionString: internalUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const identity = await client.query('SELECT current_database() AS name, current_user AS username');
    if (identity.rows[0]?.name !== 'investy_e2e' || identity.rows[0]?.username !== 'investy_e2e') throw new Error('Unexpected E2E database identity');
    const entries = JSON.parse(readFileSync('/app/apps/api/drizzle/meta/_journal.json', 'utf8')).entries;
    const expected = entries.map((entry) => ({
      hash: createHash('sha256').update(readFileSync(`/app/apps/api/drizzle/${entry.tag}.sql`, 'utf8')).digest('hex'),
      when: entry.when,
    }));
    const present = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS name");
    if (!present.rows[0]?.name) throw new Error(`Isolated E2E migrations missing: 0/${expected.length}`);
    const applied = await client.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at');
    if (applied.rows.length !== expected.length || applied.rows.some((row, index) => row.hash !== expected[index].hash || Number(row.created_at) !== expected[index].when)) {
      throw new Error(`Isolated E2E migrations differ from checked-in journal: ${applied.rows.length}/${expected.length}`);
    }
    console.log(`Isolated E2E migration hashes verified: ${applied.rows.length}/${expected.length}.`);
  } finally { await client.end(); }
}

async function main() {
  const action = process.argv[2];
  if (action !== 'migrate' && action !== 'test') throw new Error('Expected migrate or test action');
  privateText = readFileSync('/run/investy/e2e.env', 'utf8');
  const match = /^E2E_DATABASE_URL=(postgresql:\/\/[^\r\n]+)\r?\n?$/.exec(privateText);
  let target = null;
  try { if (match) target = new URL(match[1]); } catch { /* Refuse malformed private settings without echoing the URL. */ }
  if (!target || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '55432' || target.username !== 'investy_e2e' || target.pathname !== '/investy_e2e' || !/^[a-f0-9]{64}$/.test(target.password)) {
    throw new Error('E2E private file must target only the dedicated loopback test database');
  }
  password = target.password;
  internalUrl = `postgresql://investy_e2e:${password}@postgres-e2e:5432/investy_e2e`;
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  delete environment.E2E_DATABASE_URL;
  if (action === 'migrate') environment.DATABASE_URL = internalUrl;
  else environment.E2E_DATABASE_URL = internalUrl;
  if (action === 'test') await verifyMigrations();
  const result = action === 'migrate'
    ? spawnSync('node', ['dist/db/migrate.js'], { cwd: '/app/apps/api', env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 300_000 })
    : spawnSync('pnpm', ['test'], { cwd: '/app/apps/web', env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.stdout) console.log(redact(result.stdout));
  if (result.stderr) console.error(redact(result.stderr));
  if (result.error) throw new Error(`E2E ${action} failed: ${result.error.code ?? 'unknown error'}`);
  if (result.status !== 0) throw new Error(`E2E ${action} failed (exit ${result.status ?? 'unknown'}); inspect sanitized output`);
  if (action === 'migrate') await verifyMigrations();
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : 'E2E runner failed'));
  process.exitCode = 1;
});
