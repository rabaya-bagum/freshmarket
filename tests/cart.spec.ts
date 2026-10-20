import { test, expect, Page } from '@playwright/test';
import { openStore, card } from './helpers';

// GP-5: Shopping cart management
test.describe('GP-5 Shopping cart', () => {
  test.beforeEach(async ({ page }) => openStore(page));

  const add = async (page: Page, dept: string, name: string) => {
    await page.locator('#depts button', { hasText: dept }).click();
    await card(page, name).getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.locator('#toast')).toHaveText('Added to cart');
  };
  const openCart = async (page: Page) => {
    await page.locator('#cartBtn').click();
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer).toBeVisible();
    return drawer;
  };
  const row = (totals, label: string) => totals.locator('div', { has: totals.page().getByText(label, { exact: true }) }).last();

  test('cart icon shows a live item count', async ({ page }) => {
    await expect(page.locator('#count')).toHaveText('0');
    await add(page, 'Bakery', 'Sourdough Loaf');
    await expect(page.locator('#count')).toHaveText('1');
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Increase' }).click();
    await expect(page.locator('#count')).toHaveText('2');
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Decrease' }).click();
    await expect(page.locator('#count')).toHaveText('1');
  });

  test('calculates subtotal, HST, delivery fee and total', async ({ page }) => {
    await add(page, 'Bakery', 'Sourdough Loaf');
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Increase' }).click();
    const drawer = await openCart(page);
    const totals = drawer.locator('.totals');
    await expect(row(totals, 'Subtotal')).toHaveText('Subtotal$10.98');
    await expect(row(totals, 'Est. HST')).toHaveText('Est. HST$0.65');
    await expect(row(totals, 'Delivery fee')).toHaveText('Delivery fee$4.99');
    await expect(totals.getByText('Add $39.02 more for free delivery.')).toBeVisible();
    await expect(totals.locator('.grand')).toHaveText('Estimated total$16.62');
    await expect(totals.locator('.save')).toHaveCount(0);
  });

  test('totals update instantly when quantity changes in the cart', async ({ page }) => {
    await add(page, 'Bakery', 'Sourdough Loaf');
    const drawer = await openCart(page);
    await expect(drawer.locator('.line b')).toHaveText('$5.49');
    await drawer.getByRole('button', { name: 'Increase' }).click();
    await expect(drawer.locator('.line .qty span')).toHaveText('2');
    await expect(drawer.locator('.line b')).toHaveText('$10.98');
    await expect(row(drawer.locator('.totals'), 'Subtotal')).toHaveText('Subtotal$10.98');
  });

  test('delivery is free at $50 or more', async ({ page }) => {
    await add(page, 'Pantry', 'Extra Virgin Olive Oil'); // 13.99
    for (let i = 0; i < 3; i++) await card(page, 'Extra Virgin Olive Oil').getByRole('button', { name: 'Increase' }).click(); // 4 x 13.99 = 55.96
    const drawer = await openCart(page);
    await expect(row(drawer.locator('.totals'), 'Delivery fee')).toHaveText('Delivery feeFree');
    await expect(drawer.getByText(/more for free delivery/)).toHaveCount(0);
  });

  // GP-83: HST is 13% on taxable items and the delivery fee; basic groceries are zero-rated
  test('zero-rated groceries add HST only on the delivery fee', async ({ page }) => {
    await add(page, 'Produce', 'Bananas'); // $0.79 /lb, zero-rated
    const drawer = await openCart(page);
    // 13% of the $4.99 delivery fee only
    await expect(row(drawer.locator('.totals'), 'Est. HST')).toHaveText('Est. HST$0.65');
  });

  test('taxable items add 13% HST', async ({ page }) => {
    await add(page, 'Pantry', 'Dark Chocolate Bar'); // $3.99, taxable confectionery
    const drawer = await openCart(page);
    // 13% of ($3.99 + $4.99 delivery fee) = $1.17
    await expect(row(drawer.locator('.totals'), 'Est. HST')).toHaveText('Est. HST$1.17');
    await expect(drawer.locator('.totals .grand')).toHaveText('Estimated total$10.15');
  });

  test('shows savings for sale items', async ({ page }) => {
    await add(page, 'Bakery', 'Butter Croissants');
    const drawer = await openCart(page);
    await expect(drawer.locator('.totals .save')).toHaveText('You save−$1.00');
  });

  test('removes an item and shows the empty state', async ({ page }) => {
    await add(page, 'Bakery', 'Sourdough Loaf');
    const drawer = await openCart(page);
    await expect(drawer.locator('.line')).toHaveCount(1);
    await drawer.getByRole('button', { name: 'Remove' }).click();
    await expect(drawer.locator('.line')).toHaveCount(0);
    await expect(drawer.locator('.empty h2')).toHaveText('Your cart is empty');
    await expect(drawer.locator('.totals')).toHaveCount(0);
    await expect(page.locator('#count')).toHaveText('0');
  });

  test('decreasing to zero removes the item', async ({ page }) => {
    await add(page, 'Bakery', 'Sourdough Loaf');
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Decrease' }).click();
    await expect(card(page, 'Sourdough Loaf').getByRole('button', { name: 'Add to cart' })).toBeVisible();
    await expect(page.locator('#count')).toHaveText('0');
  });

  test('caps quantity at available stock', async ({ page }) => {
    await add(page, 'Meat & Seafood', 'Lean Ground Beef');
    const beef = card(page, 'Lean Ground Beef');
    for (let i = 0; i < 4; i++) await beef.getByRole('button', { name: 'Increase' }).click();
    await expect(beef.locator('.qty span')).toHaveText('3');
    await expect(page.locator('#count')).toHaveText('3');
  });

  test('out-of-stock items cannot be added', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Produce' }).click();
    const berries = card(page, 'Strawberries');
    await expect(berries.locator('.oos')).toHaveText('Out of stock at this store');
    await expect(berries.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
  });

  test('cart persists after reload', async ({ page }) => {
    await add(page, 'Bakery', 'Sourdough Loaf');
    await page.reload();
    await expect(page.locator('#count')).toHaveText('1');
    const drawer = await openCart(page);
    await expect(drawer.locator('.line')).toContainText('Sourdough Loaf');
  });

  test('guest is asked to sign in at checkout', async ({ page }) => {
    await add(page, 'Bakery', 'Sourdough Loaf');
    const drawer = await openCart(page);
    await expect(drawer.getByText('Sign in to save your cart across devices.')).toBeVisible();
    await drawer.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Sign in to continue to checkout.')).toBeVisible();
  });

  test('cart is kept after signing in', async ({ page }) => {
    await add(page, 'Bakery', 'Sourdough Loaf');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByLabel('Password').fill('Fresh123');
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#acct')).toHaveText('Hi, Demo');
    await expect(page.locator('#count')).toHaveText('1');
  });
});
