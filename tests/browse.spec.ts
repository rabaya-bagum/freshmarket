import { test, expect, Page } from '@playwright/test';
import { openStore, card } from './helpers';

// GP-2: Browse product catalog by department
test.describe('GP-2 Browse catalog', () => {
  test.beforeEach(async ({ page }) => openStore(page));

  const cards = (page: Page) => page.locator('article.card');
  const prices = async (page: Page) =>
    (await page.locator('article.card .price b').allTextContents()).map((p) => parseFloat(p.replace(/[^0-9.]/g, '')));

  test('lists all 7 departments, with All selected by default', async ({ page }) => {
    const depts = page.locator('#depts button');
    await expect(depts).toHaveText(['All', 'Produce', 'Meat & Seafood', 'Bakery', 'Deli', 'Dairy & Eggs', 'Pantry', 'Prepared Meals']);
    await expect(depts.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#title')).toHaveText('All departments');
    await expect(page.locator('#subtitle')).toHaveText('33 products');
  });

  test('filters products by department', async ({ page }) => {
    const bakery = page.locator('#depts button', { hasText: 'Bakery' });
    await bakery.click();
    await expect(bakery).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#title')).toHaveText('Bakery');
    await expect(page.locator('#subtitle')).toHaveText('4 products');
    await expect(page.locator('.pname')).toHaveText(['Sourdough Loaf', 'Butter Croissants', 'Everything Bagels', 'Gluten-Free Seed Bread']);
  });

  test('every product card shows image, name, size, price and an action', async ({ page }) => {
    await expect(cards(page)).toHaveCount(12);
    for (let i = 0; i < 12; i++) {
      const c = cards(page).nth(i);
      await expect(c.locator('.thumb')).toBeVisible();
      await expect(c.locator('.pname')).toHaveText(/\S/);
      await expect(c.locator('.size')).toHaveText(/\S/);
      await expect(c.locator('.price b')).toHaveText(/^\$\d+\.\d{2}/);
      await expect(c.locator('.add, .oos, .qty')).toHaveCount(1);
    }
  });

  test('sale card shows savings badge and original price', async ({ page }) => {
    const apples = card(page, 'Honeycrisp Apples');
    await expect(apples.locator('.badge')).toHaveText('Save $0.50');
    await expect(apples.locator('.price b')).toHaveText('$2.99 /lb');
    await expect(apples.locator('.price s')).toHaveText('$3.49');
  });

  test('regular-price card has no sale badge', async ({ page }) => {
    const bananas = card(page, 'Bananas');
    await expect(bananas.locator('.badge')).toHaveCount(0);
    await expect(bananas.locator('.price s')).toHaveCount(0);
  });

  test('combines department and dietary filters', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    const gf = page.locator('.chip', { hasText: 'Gluten-free' });
    await gf.click();
    await expect(gf).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#subtitle')).toHaveText('1 product');
    await expect(page.locator('.pname')).toHaveText(['Gluten-Free Seed Bread']);

    await gf.click();
    await expect(page.locator('#subtitle')).toHaveText('4 products');
  });

  test('Ontario grown filter shows only local products', async ({ page }) => {
    await page.locator('.chip', { hasText: 'Ontario grown' }).click();
    await expect(page.locator('#subtitle')).toHaveText('12 products');
    const labels = await page.locator('article.card .local').allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => l === 'Ontario grown')).toBe(true);
  });

  test('On sale filter shows only discounted products', async ({ page }) => {
    await page.locator('.chip', { hasText: 'On sale this week' }).click();
    await expect(page.locator('#subtitle')).toHaveText('12 products');
    await expect(cards(page)).toHaveCount(12);
    await expect(page.locator('article.card .badge')).toHaveCount(12);
    await expect(page.locator('article.card .price s')).toHaveCount(12);
  });

  test('sorts by price, low to high', async ({ page }) => {
    await page.locator('#sort').selectOption('low');
    const nums = await prices(page);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    await expect(page.locator('.pname').first()).toHaveText('Bananas');
  });

  test('sorts by price, high to low', async ({ page }) => {
    await page.locator('#sort').selectOption('high');
    const nums = await prices(page);
    expect(nums).toEqual([...nums].sort((a, b) => b - a));
    await expect(page.locator('.pname').first()).toHaveText('Atlantic Salmon Fillet');
  });

  test('loads more products without duplicates', async ({ page }) => {
    await expect(cards(page)).toHaveCount(12);
    await page.getByRole('button', { name: 'Show more products' }).click();
    await expect(cards(page)).toHaveCount(24);
    await page.getByRole('button', { name: 'Show more products' }).click();
    await expect(cards(page)).toHaveCount(33);
    await expect(page.getByRole('button', { name: 'Show more products' })).toBeHidden();

    const names = await page.locator('.pname').allTextContents();
    expect(new Set(names).size).toBe(names.length);
  });
});
