import { test, expect } from '@playwright/test';
import { openStore } from './helpers';

// GP-3: Product search with autocomplete
test.describe('GP-3 Search', () => {
  test.beforeEach(async ({ page }) => openStore(page));

  test('no suggestions for a single character', async ({ page }) => {
    await page.locator('#q').fill('b');
    await expect(page.locator('#suggest')).toBeHidden();
  });

  test('shows autocomplete after 2 characters', async ({ page }) => {
    await page.locator('#q').fill('sa');
    await expect(page.locator('#suggest')).toBeVisible();
    await expect(page.locator('#suggest')).toContainText('Atlantic Salmon Fillet');
  });

  test('tolerates typos', async ({ page }) => {
    await page.locator('#q').fill('bananna');
    await page.locator('#q').press('Enter');
    await expect(page.locator('.pname').first()).toHaveText('Bananas');
  });

  test('opens a product from a suggestion', async ({ page }) => {
    await page.locator('#q').fill('sourdough');
    await page.locator('#suggest button', { hasText: 'Sourdough Loaf' }).click();
    await expect(page.getByRole('dialog', { name: 'Sourdough Loaf' })).toBeVisible();
  });

  test('empty results suggest popular items', async ({ page }) => {
    await page.locator('#q').fill('xyzzy');
    await page.locator('#q').press('Enter');
    await expect(page.locator('.empty h2')).toHaveText('No matches for that search');
    await expect(page.locator('article.card')).toHaveCount(4);
  });
});
