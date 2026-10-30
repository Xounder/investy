import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { preflightPrivateFiles } from './private-files.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hostFile = resolve(root, '.env.e2e.local');
const pgFile = resolve(root, '.env.e2e.postgres.local');

try {
  preflightPrivateFiles(root, ['.env.e2e.local', '.env.e2e.postgres.local']);
  if (!existsSync(hostFile) && existsSync(pgFile)) throw new Error('Orphan E2E PostgreSQL settings; refusing to overwrite existing credentials');
  let password;
  if (existsSync(hostFile)) {
    const raw = readFileSync(hostFile, 'utf8');
    const match = /^E2E_DATABASE_URL=(postgresql:\/\/[^\r\n]+)\r?\n?$/.exec(raw);
    let url = null;
    try { if (match) url = new URL(match[1]); } catch { /* Refuse malformed private settings without echoing the URL. */ }
    if (!url || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/investy_e2e' || url.username !== 'investy_e2e' || !/^[a-f0-9]{64}$/.test(url.password)) {
      throw new Error('Existing E2E URL does not target the isolated loopback database; no files changed');
    }
    password = url.password;
  } else {
    password = randomBytes(32).toString('hex');
    writeFileSync(hostFile, `E2E_DATABASE_URL=postgresql://investy_e2e:${password}@127.0.0.1:55432/investy_e2e\n`, { flag: 'wx', mode: 0o600 });
  }
  if (existsSync(pgFile)) {
    if (readFileSync(pgFile, 'utf8') !== `POSTGRES_PASSWORD=${password}\n`) {
      throw new Error('E2E PostgreSQL credentials disagree; existing private files preserved');
    }
  } else {
    writeFileSync(pgFile, `POSTGRES_PASSWORD=${password}\n`, { flag: 'wx', mode: 0o600 });
  }
  console.log('Isolated E2E private settings ready (credentials withheld).');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'E2E bootstrap failed');
  process.exitCode = 1;
}
