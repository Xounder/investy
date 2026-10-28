import { defineConfig, devices } from '@playwright/test';

const realDatabase = Boolean(process.env.E2E_DATABASE_URL);

/**
 * Playwright E2E harness for apps/web.
 * The dev server is started automatically by the webServer block.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: realDatabase ? [{
    command: 'node test-support/task15-api.mjs',
    cwd: '../api',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: 'pnpm dev --config vite.real.config.ts',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  }] : {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/real/**',
    },
    {
      name: 'real-postgres',
      testMatch: '**/real/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
      workers: 1,
    },
  ],
});
