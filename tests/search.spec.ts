import { test, expect } from '@playwright/test';
import { openStore } from './helpers';

// GP-3: Product search with autocomplete
test.describe('GP-3 Search', () => {
  test.beforeEach(async ({ page }) => openStore(page));

  const box = (page) => page.locator('#suggest');
  const items = (page) => page.locator('#suggest button');

  test('no suggestions for a single character', async ({ page }) => {
    await page.locator('#q').fill('b');
    await expect(box(page)).toBeHidden();
  });

  test('shows up to 6 relevant suggestions after 2 characters', async ({ page }) => {
    await page.locator('#q').fill('ch');
    await expect(box(page)).toBeVisible();
    const n = await items(page).count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(6);
    await expect(items(page).first()).toContainText('Chicken');
    // each suggestion shows name, department and price
    await expect(items(page).first()).toContainText(/Meat & Seafood|Prepared Meals/);
    await expect(items(page).first().locator('b')).toHaveText(/^\$\d+\.\d{2}$/);
  });

  for (const [typo, expected] of [['bananna', 'Bananas'], ['croisant', 'Butter Croissants'], ['salmn', 'Atlantic Salmon Fillet']]) {
    test(`tolerates the typo "${typo}"`, async ({ page }) => {
      await page.locator('#q').fill(typo);
      await page.locator('#q').press('Enter');
      await expect(page.locator('#title')).toHaveText(`Results for “${typo}”`);
      // Must be a real match, not the "popular items" shown on a no-match page
      await expect(page.locator('.empty')).toHaveCount(0);
      await expect(page.locator('.pname').first()).toHaveText(expected);
    });
  }

  test('keyboard navigation opens the highlighted suggestion', async ({ page }) => {
    await page.locator('#q').fill('sourdough');
    await page.locator('#q').press('ArrowDown');
    await expect(items(page).first()).toHaveClass(/on/);
    await page.locator('#q').press('Enter');
    await expect(page.getByRole('dialog', { name: 'Sourdough Loaf' })).toBeVisible();
    await expect(box(page)).toBeHidden();
  });

  test('opens a product from a suggestion click', async ({ page }) => {
    await page.locator('#q').fill('sourdough');
    await items(page).filter({ hasText: 'Sourdough Loaf' }).click();
    await expect(page.getByRole('dialog', { name: 'Sourdough Loaf' })).toBeVisible();
  });

  test('search results support the same sort and filters', async ({ page }) => {
    await page.locator('#q').fill('chicken');
    await page.locator('#q').press('Enter');
    await expect(page.locator('#subtitle')).toHaveText('3 products');

    await page.locator('#sort').selectOption('low');
    await expect(page.locator('.pname')).toHaveText(['Chicken Breasts', 'Chicken Caesar Salad', 'Butter Chicken & Rice']);

    await page.locator('.chip', { hasText: 'Ontario grown' }).click();
    await expect(page.locator('.pname')).toHaveText(['Chicken Breasts']);
  });

  test('empty results explain what to do and suggest popular items', async ({ page }) => {
    await page.locator('#q').fill('xyzzy');
    await expect(box(page)).toContainText('No matches');
    await page.locator('#q').press('Enter');
    await expect(page.locator('.empty h2')).toHaveText('No matches for that search');
    await expect(page.locator('.empty p')).toContainText('Check the spelling');
    await expect(page.locator('.pname')).toHaveText(['Bananas', 'Honeycrisp Apples', '2% Milk', 'Chicken Breasts']);
  });

  test('clicking the logo clears the search', async ({ page }) => {
    await page.locator('#q').fill('milk');
    await page.locator('#q').press('Enter');
    await page.getByRole('button', { name: 'FreshMarket home' }).click();
    await expect(page.locator('#q')).toHaveValue('');
    await expect(page.locator('#title')).toHaveText('All departments');
  });
});
