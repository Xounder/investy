import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as { load: (source: string) => unknown };
const text = (path: string) => readFileSync(resolve(root, path), 'utf8');
type Service = {
  build?: { target: string };
  depends_on?: Record<string, { condition: string }>;
  env_file?: string | string[];
  environment?: Record<string, string>;
  volumes?: string[];
  ports?: string[];
  healthcheck?: { test: string[] };
  profiles?: string[];
  restart?: string;
};
type Compose = { name: string; services: Record<string, Service>; volumes: Record<string, unknown> };
const compose = (path: string) => yaml.load(text(path)) as Compose;
const service = (doc: Compose, name: string): Service => {
  const value = doc.services[name];
  if (!value) throw new Error(`Missing Docker service ${name}`);
  return value;
};
const gate = (doc: Compose, name: string, dependency: string) => service(doc, name).depends_on?.[dependency]?.condition;

describe('Docker deployment graph and isolation (static contracts, not runtime proof)', () => {
  it('gates both main consumers on a successful migration after a healthy private database', () => {
    const main = compose('compose.yaml');
    expect(main.name).not.toBe(compose('compose.e2e.yaml').name);
    expect(service(main, 'db').ports).toBeUndefined();
    expect(gate(main, 'migrate', 'db')).toBe('service_healthy');
    for (const name of ['api', 'worker']) {
      expect(gate(main, name, 'migrate')).toBe('service_completed_successfully');
      expect(service(main, name).restart).toBe('unless-stopped');
      expect(service(main, name).volumes).toContain('main_backup_data:/app/.data/backups');
    }
    expect(service(main, 'api').healthcheck?.test.join(' ')).toContain('/api/ready');
    expect(gate(main, 'web', 'api')).toBe('service_healthy');
    expect(service(main, 'web').ports).toContain('127.0.0.1:8080:80');
    expect(service(main, 'web').env_file).toBeUndefined();
    expect(service(main, 'web').environment).toBeUndefined();
    expect(service(main, 'db').env_file).toBe('.env.docker.postgres.local');
    expect(service(main, 'api').env_file).toBe('.env.docker.local');
    expect(service(main, 'worker').env_file).toBe('.env.docker.local');
    expect(service(main, 'migrate').environment?.BRAPI_API_KEY).toBe('');
    expect(service(main, 'web').build?.target).toBe('web');
  });

  it('keeps the browser and its migration on a different database and distinct persistent artifacts', () => {
    const main = compose('compose.yaml');
    const e2e = compose('compose.e2e.yaml');
    expect(gate(e2e, 'migrate-e2e', 'postgres-e2e')).toBe('service_healthy');
    expect(gate(e2e, 'browser-e2e', 'migrate-e2e')).toBe('service_completed_successfully');
    expect(service(e2e, 'browser-e2e').profiles).toContain('browser');
    expect(service(e2e, 'migrate-e2e').build?.target).toBe('e2e');
    expect(service(e2e, 'postgres-e2e').env_file).toBe('.env.e2e.postgres.local');
    expect(service(e2e, 'postgres-e2e').ports).toContain('127.0.0.1:55432:5432');
    for (const name of Object.keys(e2e.volumes)) expect(main.volumes).not.toHaveProperty(name);
    expect(service(e2e, 'browser-e2e').volumes).toEqual(expect.arrayContaining([
      './.env.e2e.local:/run/investy/e2e.env:ro',
      'e2e_test_results:/app/apps/web/test-results',
      'e2e_playwright_report:/app/apps/web/playwright-report',
    ]));
    expect(service(e2e, 'browser-e2e').env_file).toBeUndefined();
    const runner = text('docker/run-e2e.js');
    expect(runner).toContain('postgres-e2e:5432/investy_e2e');
    expect(runner).toContain('delete environment.DATABASE_URL');
    expect(runner).toContain('await verifyMigrations()');
    const dockerfile = text('Dockerfile');
    const version = JSON.parse(text('apps/web/package.json')).devDependencies['@playwright/test'];
    expect(dockerfile).toContain(`mcr.microsoft.com/playwright:v${version.replace('~', '')}-noble`);
  });

  it('keeps secrets outside image context but includes real browser and API launcher sources', () => {
    const ignore = text('.dockerignore').split(/\r?\n/).filter(Boolean);
    for (const pattern of ['.git', '.opencode', 'opencode.jsonc', '**/node_modules', '**/test-results', '.env.*', '**/.env.*', '.data']) {
      expect(ignore).toContain(pattern);
    }
    expect(ignore).not.toContain('apps/web/e2e');
    expect(ignore).not.toContain('apps/api/test-support');
    const dockerfile = text('Dockerfile');
    expect(dockerfile).not.toMatch(/ARG\s+(?:DATABASE_URL|SESSION_SECRET|POSTGRES_PASSWORD)/);
    expect(dockerfile).toContain('COPY . .');
  });

  it('routes bare /api and /api/* to API while separating SPA deep links from missing assets', () => {
    const nginx = text('docker/nginx.conf');
    const locations = [...nginx.matchAll(/location\s+(=|\^~|~\*)?\s*(\/[^\s{]*|\\\.[^\s{]+)\s*\{([^}]*)\}/g)];
    const exact = locations.find((match) => match[1] === '=' && match[2] === '/api')?.[3];
    const prefix = locations.find((match) => match[1] === '^~' && match[2] === '/api/')?.[3];
    const assetLocation = nginx.match(/location\s+~\*\s+(\S+)\s*\{([^}]*)\}/);
    if (!assetLocation?.[1]) throw new Error('Missing nginx static-asset location regex');
    const assetRegex = new RegExp(assetLocation[1], 'i');
    const assets = assetLocation?.[2];
    const spa = locations.find((match) => match[2] === '/')?.[3];
    expect(exact).toContain('proxy_pass http://api:3000;');
    expect(prefix).toContain('proxy_pass http://api:3000;');
    expect(prefix).not.toContain('proxy_pass http://api:3000/;');
    expect(assets).toContain('try_files $uri =404;');
    expect(spa).toContain('try_files $uri $uri/ /index.html;');
    const route = (path: string) => path === '/api' && exact?.includes('proxy_pass') || path.startsWith('/api/') && prefix?.includes('proxy_pass')
      ? 'api' : assetRegex.test(path) && assets?.includes('try_files $uri =404;') ? 'asset-404' : spa?.includes('/index.html') ? 'spa' : 'unhandled';
    expect(['/api', '/api/ready', '/api/v1/auth/me', '/api/foo.js'].map(route)).toEqual(['api', 'api', 'api', 'api']);
    expect(route('/assets/PETR4')).toBe('spa');
    expect(route('/assets/missing.js')).toBe('asset-404');
    expect(route('/assets/missing.css')).toBe('asset-404');
  });
});
