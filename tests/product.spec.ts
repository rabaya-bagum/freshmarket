import { test, expect } from '@playwright/test';
import { openStore } from './helpers';

// GP-4: Product detail page
test.describe('GP-4 Product detail page', () => {
  test.beforeEach(async ({ page }) => openStore(page));

  const open = async (page, name: string) => {
    await page.locator('#q').fill(name);
    await page.locator('#q').press('Enter');
    await page.locator('.pname', { hasText: name }).first().click();
    return page.getByRole('dialog', { name });
  };

  test('shows nutrition facts and allergens', async ({ page }) => {
    const d = await open(page, 'Butter Croissants');
    await expect(d.locator('.nf')).toContainText('Calories');
    await expect(d.locator('.allergen')).toContainText('Wheat, Milk, Egg');
  });

  test('shows price per lb and per kg for weighted items', async ({ page }) => {
    const d = await open(page, 'Atlantic Salmon Fillet');
    await expect(d).toContainText('$13.99');
    await expect(d).toContainText('$30.84 /kg');
    await expect(d).toContainText('charged for the actual weight');
  });

  test('shows in-stock, low-stock and out-of-stock states', async ({ page }) => {
    let d = await open(page, 'Sourdough Loaf');
    await expect(d.locator('.stock')).toHaveText('In stock at Square One');
    await page.keyboard.press('Escape');

    d = await open(page, 'Lean Ground Beef');
    await expect(d.locator('.stock')).toHaveText('Only 3 left at Square One');
    await page.keyboard.press('Escape');

    d = await open(page, 'Strawberries');
    await expect(d.locator('.stock')).toHaveText('Out of stock at Square One');
    await expect(d.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
  });

  test('adds to cart from the product page', async ({ page }) => {
    const d = await open(page, 'Hass Avocados');
    await d.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.locator('#count')).toHaveText('1');
  });
});
