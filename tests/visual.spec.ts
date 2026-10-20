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
    await expect(page.locator('#title')).toHaveText('All departments');
    await expect(page.locator('article.card')).toHaveCount(12);
    await expect(page).toHaveScreenshot('home.png', shot);
  });

  test('home page in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 22, 18)');
    await expect(page).toHaveScreenshot('home-dark.png', shot);
  });

  test('GP-2 department with filter applied', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await page.locator('.chip', { hasText: 'Vegan' }).click();
    await expect(page.locator('#subtitle')).toHaveText('3 products');
    await expect(page).toHaveScreenshot('bakery-vegan.png', shot);
  });

  test('GP-2 product card with sale badge', async ({ page }) => {
    await expect(card(page, 'Honeycrisp Apples').locator('.badge')).toHaveText('Save $0.50');
    await expect(card(page, 'Honeycrisp Apples')).toHaveScreenshot('card-sale.png');
  });

  test('GP-2 out-of-stock product card', async ({ page }) => {
    await expect(card(page, 'Strawberries').locator('.oos')).toBeVisible();
    await expect(card(page, 'Strawberries')).toHaveScreenshot('card-out-of-stock.png');
  });
});

test.describe('Visual: search', () => {
  test.beforeEach(async ({ page }) => openStable(page));

  test('GP-3 autocomplete dropdown', async ({ page }) => {
    await page.locator('#q').fill('ch');
    await expect(page.locator('#suggest')).toBeVisible();
    await expect(page.locator('#suggest button').first()).toContainText('Chicken');
    await expect(page).toHaveScreenshot('search-autocomplete.png', shot);
  });

  test('GP-3 no results page', async ({ page }) => {
    await page.locator('#q').fill('xyzzy');
    await page.locator('#q').press('Enter');
    await page.locator('#q').blur();
    await expect(page.locator('.empty h2')).toHaveText('No matches for that search');
    await expect(page.locator('#suggest')).toBeHidden();
    await expect(page).toHaveScreenshot('search-empty.png', shot);
  });
});

test.describe('Visual: product and cart', () => {
  test.beforeEach(async ({ page }) => openStable(page));

  test('GP-4 product detail dialog', async ({ page }) => {
    await page.locator('.pname', { hasText: 'Honeycrisp Apples' }).click();
    await expect(page.getByRole('dialog', { name: 'Honeycrisp Apples' })).toBeVisible();
    await expect(page.locator('.panel')).toHaveScreenshot('product-detail.png');
  });

  test('GP-5 cart drawer with items and totals', async ({ page }) => {
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await card(page, 'Sourdough Loaf').getByRole('button', { name: 'Add to cart' }).click();
    await card(page, 'Butter Croissants').getByRole('button', { name: 'Add to cart' }).click();
    await page.locator('#toast').evaluate((el) => (el.hidden = true));
    await page.locator('#cartBtn').click();
    await expect(page.locator('.drawer .line')).toHaveCount(2);
    await expect(page.locator('.drawer .grand')).toHaveText('Estimated total$16.84');
    await expect(page.locator('.drawer')).toHaveScreenshot('cart-drawer.png');
  });

  test('GP-5 empty cart', async ({ page }) => {
    await page.locator('#cartBtn').click();
    await expect(page.locator('.drawer .empty h2')).toHaveText('Your cart is empty');
    await expect(page.locator('.drawer')).toHaveScreenshot('cart-empty.png');
  });
});

test.describe('Visual: account', () => {
  test.beforeEach(async ({ page }) => openStable(page));

  test('GP-1 sign-in dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.panel')).toHaveScreenshot('sign-in.png');
  });

  test('GP-1 wrong password error', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByLabel('Password').fill('wrong-pass');
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.err')).toContainText("don't match");
    await expect(page.locator('.panel')).toHaveScreenshot('sign-in-error.png');
  });
});

test.describe('Visual: checkout', () => {
  test.use({ timezoneId: 'America/Toronto' });
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-14T08:00:00-04:00'));
    await openStable(page);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByLabel('Password').fill('Fresh123');
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await page.locator('#toast').evaluate((el) => (el.hidden = true));
    await page.locator('#depts button', { hasText: 'Pantry' }).click();
    const oil = card(page, 'Extra Virgin Olive Oil');
    await oil.getByRole('button', { name: 'Add to cart' }).click();
    await oil.getByRole('button', { name: 'Increase' }).click();
    await oil.getByRole('button', { name: 'Increase' }).click();
    await page.locator('#toast').evaluate((el) => (el.hidden = true));
    await page.locator('#cartBtn').click();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    const co = page.getByRole('dialog', { name: 'Checkout' });
    await co.getByLabel('Street address').fill('100 City Centre Dr');
    await co.getByLabel('Postal code').fill('L5B 2C9');
    await co.getByRole('button', { name: 'Check' }).click();
    await co.getByRole('group', { name: 'Time' }).getByRole('button', { name: '10 am – 11 am' }).click();
  });

  test('GP-6 delivery and time slot step', async ({ page }) => {
    await expect(page.locator('#co-hold')).toContainText('until 8:30 am');
    await expect(page.locator('#co-zip')).toHaveText('We deliver to L5B 2C9.');
    await expect(page.locator('.panel')).toHaveScreenshot('checkout-slots.png');
  });

  test('GP-7 review and pay step', async ({ page }) => {
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
    await expect(page.locator('.panel .grand')).toHaveText('Total$47.61');
    await expect(page.locator('.panel')).toHaveScreenshot('checkout-pay.png');
  });

  test('GP-7 declined card error', async ({ page }) => {
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await page.getByLabel('Name on card').fill('Demo Shopper');
    await page.getByLabel('Card number').fill('4000 0000 0000 0002');
    await page.getByLabel('Expiry (MM/YY)').fill('12/30');
    await page.getByLabel('Security code').fill('123');
    await page.getByRole('button', { name: /^Place order/ }).click();
    await expect(page.locator('#co-err')).toContainText('declined');
    await expect(page.locator('.panel')).toHaveScreenshot('checkout-declined.png');
  });

  test('GP-8 order confirmation', async ({ page }) => {
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await page.getByLabel('Name on card').fill('Demo Shopper');
    await page.getByLabel('Card number').fill('4242 4242 4242 4242');
    await page.getByLabel('Expiry (MM/YY)').fill('12/30');
    await page.getByLabel('Security code').fill('123');
    await page.getByRole('button', { name: /^Place order/ }).click();
    await expect(page.getByRole('heading', { name: 'Order FM-1001 confirmed' })).toBeVisible();
    await expect(page.locator('.panel')).toHaveScreenshot('order-confirmed.png');
  });
});
