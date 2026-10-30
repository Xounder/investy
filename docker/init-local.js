import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { preflightPrivateFiles } from './private-files.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const server = resolve(root, '.env.docker.local');
const postgres = resolve(root, '.env.docker.postgres.local');

try {
  preflightPrivateFiles(root, ['.env.docker.local', '.env.docker.postgres.local']);
  if (existsSync(server) || existsSync(postgres)) {
    if (!existsSync(server) || !existsSync(postgres)) throw new Error('Only one private file exists; refusing to overwrite either');
    const serverText = readFileSync(server, 'utf8');
    const pgText = readFileSync(postgres, 'utf8');
    const serverFields = /^DATABASE_URL=(postgresql:\/\/[^\r\n]+)\r?\nSESSION_SECRET=([a-f0-9]{96})(?:\r?\nBRAPI_API_KEY=([A-Za-z0-9._~+=\/-]+))?\r?\n?$/.exec(serverText);
    const postgresFields = /^POSTGRES_PASSWORD=([a-f0-9]{64})\r?\n?$/.exec(pgText);
    const connection = serverFields?.[1];
    const dbPassword = postgresFields?.[1];
    const session = serverFields?.[2];
    let parsed = null;
    try { if (connection) parsed = new URL(connection); } catch { /* Keep private URL out of errors. */ }
    if (!dbPassword || !session || parsed?.protocol !== 'postgresql:' || parsed.hostname !== 'db' || parsed.port !== '5432' || parsed.pathname !== '/investy_local' || parsed.username !== 'investy_local' || parsed.password !== dbPassword) {
      throw new Error('Existing main Docker settings do not match the isolated service; no files changed');
    }
    console.log('Existing private main Docker settings preserved.');
  } else {
    const password = randomBytes(32).toString('hex');
    const session = randomBytes(48).toString('hex');
    writeFileSync(server, `DATABASE_URL=postgresql://investy_local:${password}@db:5432/investy_local\nSESSION_SECRET=${session}\n`, { flag: 'wx', mode: 0o600 });
    writeFileSync(postgres, `POSTGRES_PASSWORD=${password}\n`, { flag: 'wx', mode: 0o600 });
    console.log('Generated ignored main Docker settings (credentials not displayed).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Docker bootstrap failed');
  process.exitCode = 1;
}
