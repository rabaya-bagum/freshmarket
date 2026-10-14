import { test, expect } from '@playwright/test';
import { openStore, card } from './helpers';

// GP-5: Shopping cart management
test.describe('GP-5 Shopping cart', () => {
  test.beforeEach(async ({ page }) => openStore(page));

  const addSourdough = async (page) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Add to cart' }).click();
  };

  test('cart icon shows a live item count', async ({ page }) => {
    await addSourdough(page);
    await expect(page.locator('#count')).toHaveText('1');
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Increase' }).click();
    await expect(page.locator('#count')).toHaveText('2');
  });

  test('calculates subtotal, HST, delivery fee and total', async ({ page }) => {
    await addSourdough(page);
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Increase' }).click();
    await page.locator('#cartBtn').click();
    const totals = page.locator('.totals');
    await expect(totals).toContainText('Subtotal$10.98');
    await expect(totals).toContainText('Est. HST$0.36');
    await expect(totals).toContainText('Delivery fee$4.99');
    await expect(totals).toContainText('Add $39.02 more for free delivery');
    await expect(totals.locator('.grand')).toContainText('$16.33');
  });

  test('shows savings for sale items', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await card(page, 'Butter Croissants').getByRole('button', { name: 'Add to cart' }).click();
    await page.locator('#cartBtn').click();
    await expect(page.locator('.totals .save')).toContainText('−$1.00');
  });

  test('removes an item and shows the empty state', async ({ page }) => {
    await addSourdough(page);
    await page.locator('#cartBtn').click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.drawer .empty h2')).toHaveText('Your cart is empty');
    await expect(page.locator('#count')).toHaveText('0');
  });

  test('caps quantity at available stock', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Meat & Seafood' }).click();
    const beef = card(page, 'Lean Ground Beef');
    await beef.getByRole('button', { name: 'Add to cart' }).click();
    for (let i = 0; i < 4; i++) await beef.getByRole('button', { name: 'Increase' }).click();
    await expect(beef.locator('.qty span')).toHaveText('3');
  });

  test('cart persists after reload', async ({ page }) => {
    await addSourdough(page);
    await page.reload();
    await expect(page.locator('#count')).toHaveText('1');
  });

  test('checkout asks a guest to sign in', async ({ page }) => {
    await addSourdough(page);
    await page.locator('#cartBtn').click();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page.getByText('Sign in to continue to checkout.')).toBeVisible();
  });
});
