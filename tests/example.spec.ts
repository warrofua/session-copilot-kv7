import { test, expect, type Page } from '@playwright/test';

async function acceptTermsIfPresent(page: Page) {
  const accept = page.getByTestId('terms-accept-button');
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await expect(page.locator('.terms-overlay')).toBeHidden();
  }
}

async function stubAuthMe(page: Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'demo-user-id',
          email: 'demo2@agentsofaba.com',
          name: 'Demo User',
          role: 'bcba',
          permissions: [],
          encryptionSalt: 'mock-salt',
          assignedLearnerIds: ['demo'],
        },
        organization: { id: 'demo-org', name: 'Demo Org' },
        learners: [{ id: 'demo', name: 'Alex B.', orgId: 'demo-org', status: 'active' }],
      }),
    });
  });
}

test('landing page renders', async ({ page }) => {
  await stubAuthMe(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Agents of ABA' })).toBeVisible();
  await expect(page.getByRole('link', { name: /try demo/i })).toBeVisible();
});

test('demo route loads session UI', async ({ page }) => {
  await stubAuthMe(page);
  await page.goto('/demo');
  await acceptTermsIfPresent(page);
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('.action-buttons')).toBeVisible();
  await expect(page.locator('.input-field')).toBeVisible();
});
