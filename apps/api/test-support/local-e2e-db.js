import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Client } from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const api = join(root, 'apps/api');
const privateFile = join(root, '.env.e2e.local');
const postgresFile = join(root, '.env.e2e.postgres.local');
const composeFile = join(root, 'docker/compose.e2e.yaml');
const project = 'investy-local-e2e';
const dbName = 'investy_e2e';
let password = '';
let url = '';

function safeFile(path) {
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile() || !realpathSync(path).startsWith(root + '\\') && !realpathSync(path).startsWith(root + '/'))) {
    throw new Error('Refusing to read a non-regular or external private file');
  }
}

function failSafe(text) {
  let result = String(text);
  for (const secret of [password, url, encodeURIComponent(password)]) {
    if (secret) result = result.replaceAll(secret, '[REDACTED]');
  }
  return result.replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED DATABASE URL]');
}

function execute(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    shell: process.platform === 'win32' && program === 'pnpm',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${program} ${args[0] ?? ''} failed: ${failSafe(result.stderr || result.stdout || result.error?.message || 'unknown error')}`);
  }
  if (options.show) console.log(failSafe(result.stdout));
}

function compose(args) {
  execute('docker', ['compose', '-p', project, '-f', composeFile, ...args]);
}

function ensurePostgresFile() {
  safeFile(postgresFile);
  if (existsSync(postgresFile)) {
    if (readFileSync(postgresFile, 'utf8') !== `POSTGRES_PASSWORD=${password}\n`) {
      throw new Error('Isolated PostgreSQL credentials disagree; existing settings preserved');
    }
  } else {
    execute('git', ['check-ignore', '-q', '.env.e2e.postgres.local']);
    writeFileSync(postgresFile, `POSTGRES_PASSWORD=${password}\n`, { flag: 'wx', mode: 0o600 });
  }
}

function readPrivate() {
  safeFile(privateFile);
  if (!existsSync(privateFile)) throw new Error('Missing .env.e2e.local; run init first');
  const content = readFileSync(privateFile, 'utf8');
  const match = /^E2E_DATABASE_URL=(.+)$/m.exec(content);
  if (!match) throw new Error('Private file missing E2E_DATABASE_URL');
  let parsed;
  try { parsed = new URL(match[1]); } catch { throw new Error('Private E2E URL is malformed; value withheld'); }
  if (parsed.protocol !== 'postgresql:' || parsed.hostname !== '127.0.0.1' || parsed.port !== '55432' || parsed.pathname !== '/' + dbName || parsed.username !== 'investy_e2e' || !parsed.password) {
    throw new Error('Private file does not target the dedicated loopback E2E database');
  }
  password = decodeURIComponent(parsed.password);
  url = parsed.href;
}

async function status() {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const identity = await client.query('SELECT current_database() AS name, current_user AS username');
    if (identity.rows[0].name !== dbName || identity.rows[0].username !== 'investy_e2e') throw new Error('Unexpected database identity');
    const journal = JSON.parse(readFileSync(join(api, 'drizzle/meta/_journal.json'), 'utf8'));
    const expected = journal.entries.map((entry) => {
      const sql = readFileSync(join(api, 'drizzle', `${entry.tag}.sql`), 'utf8');
      return { when: entry.when, hash: createHash('sha256').update(sql).digest('hex') };
    });
    const table = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS name");
    if (!table.rows[0].name) throw new Error(`Migration status: 0/${expected.length}; run migrate`);
    const actual = await client.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at');
    if (actual.rows.length !== expected.length || actual.rows.some((row, index) => row.hash !== expected[index].hash || Number(row.created_at) !== expected[index].when)) {
      throw new Error(`Migration mismatch: ${actual.rows.length}/${expected.length}; inspect the test database before continuing`);
    }
    console.log(`Connected to isolated ${dbName} on loopback; migration hashes verified: ${actual.rows.length}/${expected.length}.`);
  } finally {
    await client.end();
  }
}

async function main() {
  const action = process.argv[2];
  if (!['init', 'up', 'migrate', 'status', 'test', 'down'].includes(action)) throw new Error('Usage: node apps/api/test-support/local-e2e-db.js init|up|migrate|status|test|down');
  if (action === 'init') {
    safeFile(privateFile);
    if (existsSync(privateFile)) { readPrivate(); ensurePostgresFile(); console.log('Existing private E2E settings preserved.'); return; }
    execute('docker', ['compose', 'version']);
    execute('git', ['check-ignore', '-q', '.env.e2e.local']);
    password = randomBytes(32).toString('hex');
    url = `postgresql://investy_e2e:${password}@127.0.0.1:55432/${dbName}`;
    writeFileSync(privateFile, `E2E_DATABASE_URL=${url}\n`, { flag: 'wx', mode: 0o600 });
    ensurePostgresFile();
    console.log('Created ignored private E2E settings; credentials withheld.');
    return;
  }
  readPrivate();
  if (action === 'up') { compose(['config', '--quiet']); compose(['up', '-d', '--wait', 'postgres-e2e']); await status().catch((error) => { if (!String(error).includes('Migration status: 0/')) throw error; console.log('Database ready; migrations pending.'); }); return; }
  if (action === 'down') { compose(['stop', 'postgres-e2e']); console.log('Stopped isolated E2E PostgreSQL; volume and private file retained.'); return; }
  if (action === 'migrate') {
    // The migration CLI reads DATABASE_URL; never inherit the operator's main database.
    execute('pnpm', ['db:migrate'], { cwd: api, env: { DATABASE_URL: url, E2E_DATABASE_URL: url } });
    await status();
    return;
  }
  if (action === 'status') { await status(); return; }
  try {
    await status();
    execute('pnpm', ['test'], { cwd: join(root, 'apps/web'), env: { E2E_DATABASE_URL: url }, show: true });
  } finally {
    compose(['stop', 'postgres-e2e']);
    console.log('Stopped isolated E2E PostgreSQL.');
  }
}

main().catch((error) => {
  console.error(failSafe(error instanceof Error ? error.message : 'Unknown local E2E failure'));
  process.exitCode = 1;
});
