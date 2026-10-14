import { test, expect } from '@playwright/test';
import { openStore } from './helpers';

// GP-2: Browse product catalog by department
test.describe('GP-2 Browse catalog', () => {
  test.beforeEach(async ({ page }) => openStore(page));

  test('lists all 7 departments', async ({ page }) => {
    const depts = page.locator('#depts button');
    await expect(depts).toHaveCount(8); // All + 7 departments
    for (const d of ['Produce', 'Meat & Seafood', 'Bakery', 'Deli', 'Dairy & Eggs', 'Pantry', 'Prepared Meals']) {
      await expect(depts.filter({ hasText: d })).toBeVisible();
    }
  });

  test('filters products by department', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await expect(page.locator('#title')).toHaveText('Bakery');
    await expect(page.locator('#subtitle')).toHaveText('4 products');
  });

  test('product cards show name, size, price and sale badge', async ({ page }) => {
    const first = page.locator('article.card').first();
    await expect(first.locator('.pname')).not.toBeEmpty();
    await expect(first.locator('.size')).not.toBeEmpty();
    await expect(first.locator('.price b')).toContainText('$');
    await expect(page.locator('.badge').first()).toContainText('Save');
  });

  test('combines department and dietary filters', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await page.locator('.chip', { hasText: 'Gluten-free' }).click();
    await expect(page.locator('#subtitle')).toHaveText('1 product');
    await expect(page.locator('.pname')).toHaveText(['Gluten-Free Seed Bread']);
  });

  test('sorts by price, low to high', async ({ page }) => {
    await page.locator('#sort').selectOption('low');
    const prices = await page.locator('article.card .price b').allTextContents();
    const nums = prices.map((p) => parseFloat(p.replace(/[^0-9.]/g, '')));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  test('loads more products with "Show more"', async ({ page }) => {
    await expect(page.locator('article.card')).toHaveCount(12);
    await page.getByRole('button', { name: 'Show more products' }).click();
    await expect(page.locator('article.card')).toHaveCount(24);
  });
});
