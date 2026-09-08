import { expect, test } from '@playwright/test';

test('renders the Investy shell in the browser', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Investy').first()).toBeVisible();
  await expect(page.getByText('Seu painel de investimentos')).toBeVisible();
});
