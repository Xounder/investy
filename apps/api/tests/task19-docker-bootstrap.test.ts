import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures: string[] = [];
afterEach(() => {
  for (const folder of fixtures.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function git(folder: string, args: string[]) {
  const result = spawnSync('git', ['-C', folder, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed (exit ${result.status})`);
}

function worktree() {
  const folder = mkdtempSync(join(root, '.task19-bootstrap-test-'));
  fixtures.push(folder);
  mkdirSync(join(folder, 'docker'));
  writeFileSync(join(folder, 'package.json'), '{"type":"module"}\n');
  for (const name of ['private-files.js', 'init-local.js', 'init-e2e.js']) {
    copyFileSync(join(root, 'docker', name), join(folder, 'docker', name));
  }
  git(folder, ['init', '-q']);
  return folder;
}

function bootstrap(folder: string, script: 'init-local.js' | 'init-e2e.js') {
  return spawnSync('node', [join(folder, 'docker', script)], { cwd: folder, encoding: 'utf8' });
}

describe('Docker-native private file bootstrap in real isolated Git worktrees', () => {
  it('checks BOTH effective ignore rules before any writes, preserves pairs and refuses tracked secrets', () => {
    const folder = worktree();
    const server = join(folder, '.env.docker.local');
    const postgres = join(folder, '.env.docker.postgres.local');
    writeFileSync(join(folder, '.gitignore'), '.env.*\n!.env.docker.postgres.local\n');
    expect(bootstrap(folder, 'init-local.js').status).not.toBe(0);
    expect(existsSync(server)).toBe(false);
    expect(existsSync(postgres)).toBe(false);

    writeFileSync(join(folder, '.gitignore'), '.env.*\n');
    expect(bootstrap(folder, 'init-local.js').status).toBe(0);
    const original = readFileSync(server, 'utf8');
    const originalPg = readFileSync(postgres, 'utf8');
    expect(original).toMatch(/^DATABASE_URL=postgresql:\/\/investy_local:[a-f0-9]{64}@db:5432\/investy_local\nSESSION_SECRET=[a-f0-9]{96}\n$/);
    expect(originalPg).toBe(`POSTGRES_PASSWORD=${original.match(/investy_local:([a-f0-9]{64})@db/)?.[1]}\n`);
    expect(bootstrap(folder, 'init-local.js').status).toBe(0);
    expect(readFileSync(server, 'utf8')).toBe(original);

    const withProvider = `${original}BRAPI_API_KEY=localTestOnlyToken\n`;
    writeFileSync(server, withProvider);
    expect(bootstrap(folder, 'init-local.js').status).toBe(0);
    expect(readFileSync(server, 'utf8')).toBe(withProvider);
    writeFileSync(server, `${withProvider}UNKNOWN_PROVIDER_KEY=test\n`);
    expect(bootstrap(folder, 'init-local.js').status).not.toBe(0);
    expect(readFileSync(postgres, 'utf8')).toBe(originalPg);
    writeFileSync(server, original);

    git(folder, ['add', '-f', '.env.docker.postgres.local']);
    expect(bootstrap(folder, 'init-local.js').status).not.toBe(0);
    expect(readFileSync(server, 'utf8')).toBe(original);
    expect(readFileSync(postgres, 'utf8')).toBe(originalPg);
  });

  it('preserves an existing isolated host URL and refuses to write an unignored E2E password', () => {
    const folder = worktree();
    const host = join(folder, '.env.e2e.local');
    const pg = join(folder, '.env.e2e.postgres.local');
    const secret = 'a'.repeat(64);
    const original = `E2E_DATABASE_URL=postgresql://investy_e2e:${secret}@127.0.0.1:55432/investy_e2e\n`;
    writeFileSync(host, original);
    writeFileSync(join(folder, '.gitignore'), '.env.*\n!.env.e2e.postgres.local\n');
    expect(bootstrap(folder, 'init-e2e.js').status).not.toBe(0);
    expect(existsSync(pg)).toBe(false);
    expect(readFileSync(host, 'utf8')).toBe(original);

    writeFileSync(join(folder, '.gitignore'), '.env.*\n');
    expect(bootstrap(folder, 'init-e2e.js').status).toBe(0);
    expect(readFileSync(host, 'utf8')).toBe(original);
    expect(readFileSync(pg, 'utf8')).toBe(`POSTGRES_PASSWORD=${secret}\n`);
  });
});
