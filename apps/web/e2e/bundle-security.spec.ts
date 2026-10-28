import { expect, test } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('production browser bundle excludes server credentials and connection strings', async () => {
  const directory = resolve(process.cwd(), 'dist/assets');
  let files: string[];
  try { files = (await readdir(directory)).filter((name) => name.endsWith('.js')); }
  catch { throw new Error('Build apps/web before running the bundle security test: dist/assets is missing.'); }
  expect(files.length, 'Production build must contain at least one JS asset').toBeGreaterThan(0);
  const scripts = await Promise.all(files.map((file) => readFile(resolve(directory, file), 'utf8')));
  const source = scripts.join('\n');
  if (/postgres(?:ql)?:\/\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|process\.env\.(?:DATABASE_URL|E2E_DATABASE_URL|SESSION_SECRET|BRAPI_API_KEY)/i.test(source)) {
    throw new Error('Browser bundle contains a server-only credential pattern (REDACTED)');
  }
  for (const key of ['DATABASE_URL', 'E2E_DATABASE_URL', 'SESSION_SECRET', 'BRAPI_API_KEY'] as const) {
    const value = process.env[key];
    // Never pass a credential to an assertion: Playwright prints assertion inputs.
    if (value && source.includes(value)) throw new Error(`Browser bundle leaked ${key} (REDACTED)`);
  }
});
