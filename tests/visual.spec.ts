import { test, expect, Page } from '@playwright/test';
import { card } from './helpers';

// Visual regression tests: each screen is compared with an approved baseline image.
// Baselines live in tests/visual.spec.ts-snapshots/ and are created on the first CI run.
// After an intended design change, run the workflow with "update snapshots" to approve new baselines.

async function openStable(page: Page) {
  // Web fonts load from Google; block them so screenshots never depend on network timing.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

const shot = { fullPage: false, maxDiffPixelRatio: 0.01 };

test.describe('Visual: storefront', () => {
  test.beforeEach(async ({ page }) => openStable(page));

  test('home page', async ({ page }) => {
    await expect(page).toHaveScreenshot('home.png', shot);
  });

  test('home page in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page).toHaveScreenshot('home-dark.png', shot);
  });

  test('GP-2 department with filter applied', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await page.locator('.chip', { hasText: 'Vegan' }).click();
    await expect(page).toHaveScreenshot('bakery-vegan.png', shot);
  });

  test('GP-2 product card with sale badge', async ({ page }) => {
    await expect(card(page, 'Honeycrisp Apples')).toHaveScreenshot('card-sale.png');
  });

  test('GP-2 out-of-stock product card', async ({ page }) => {
    await expect(card(page, 'Strawberries')).toHaveScreenshot('card-out-of-stock.png');
  });
});

test.describe('Visual: search', () => {
  test.beforeEach(async ({ page }) => openStable(page));

  test('GP-3 autocomplete dropdown', async ({ page }) => {
    await page.locator('#q').fill('ch');
    await expect(page.locator('#suggest')).toBeVisible();
    await expect(page).toHaveScreenshot('search-autocomplete.png', shot);
  });

  test('GP-3 no results page', async ({ page }) => {
    await page.locator('#q').fill('xyzzy');
    await page.locator('#q').press('Enter');
    await page.locator('#q').blur();
    await expect(page).toHaveScreenshot('search-empty.png', shot);
  });
});

test.describe('Visual: product and cart', () => {
  test.beforeEach(async ({ page }) => openStable(page));

  test('GP-4 product detail dialog', async ({ page }) => {
    await page.locator('.pname', { hasText: 'Honeycrisp Apples' }).click();
    await expect(page.locator('.panel')).toHaveScreenshot('product-detail.png');
  });

  test('GP-5 cart drawer with items and totals', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Add to cart' }).click();
    await card(page, 'Butter Croissants').getByRole('button', { name: 'Add to cart' }).click();
    await page.locator('#toast').evaluate((el) => (el.hidden = true));
    await page.locator('#cartBtn').click();
    await expect(page.locator('.drawer')).toHaveScreenshot('cart-drawer.png');
  });

  test('GP-5 empty cart', async ({ page }) => {
    await page.locator('#cartBtn').click();
    await expect(page.locator('.drawer')).toHaveScreenshot('cart-empty.png');
  });
});

test.describe('Visual: account', () => {
  test.beforeEach(async ({ page }) => openStable(page));

  test('GP-1 sign-in dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.panel')).toHaveScreenshot('sign-in.png');
  });

  test('GP-1 wrong password error', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByLabel('Password').fill('wrong-pass');
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.panel')).toHaveScreenshot('sign-in-error.png');
  });
});
