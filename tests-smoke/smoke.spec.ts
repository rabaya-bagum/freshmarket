import { test, expect, Page } from '@playwright/test';

// Smoke tests: a few fast checks that a deployment is alive and wired up correctly.
// They run against the real site after every Vercel deploy (preview and production).
// They never place a real order: the payment check only creates an unconfirmed test-mode PaymentIntent.

async function openStore(page: Page) {
  const response = await page.goto('/');
  expect(response?.status(), 'home page HTTP status').toBe(200);
  expect(page.url(), 'redirected to a login page: Vercel Deployment Protection is blocking the smoke tests').not.toContain('vercel.com/login');
  await expect(page).toHaveTitle('FreshMarket');
  await expect(page.locator('article.card')).toHaveCount(12);
}

test.describe('Smoke', () => {
  test('home page loads with products and no errors @mobile', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Script errors only; a failed font or favicon download is not a broken store
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|fonts\.g/.test(m.text())) errors.push(m.text()); });
    await openStore(page);
    await expect(page.locator('#subtitle')).toHaveText('50 products');
    await expect(page.getByRole('combobox', { name: 'Choose your store' })).toBeVisible();
    expect(errors, 'browser errors on the home page').toEqual([]);
  });

  test('payment config is on, in test mode, and never leaks the secret key', async ({ request }) => {
    const res = await request.get('/api/config');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store');
    const body = await res.json();
    expect(body.setupProblem, 'Stripe key problem reported by the site').toBeUndefined();
    expect(body).toMatchObject({ stripe: true, testMode: true });
    expect(body.publishableKey).toMatch(/^pk_test_[A-Za-z0-9]{24,}$/);
    expect(JSON.stringify(body)).not.toMatch(/sk_(test|live)_/);
  });

  test('payment server prices an order and reaches Stripe', async ({ request }) => {
    const config = await (await request.get('/api/config')).json();
    // Safety stop: this check creates a PaymentIntent, so it must never run against live keys
    expect(config.testMode, 'refusing to create a payment on live Stripe keys').toBe(true);
    // Extra Virgin Olive Oil (id 25) × 3 for pickup: $41.97 + HST $1.36 = $43.33
    const res = await request.post('/api/create-payment-intent', { data: { mode: 'pickup', items: [{ id: 25, q: 3 }] } });
    const body = await res.json();
    expect(res.status(), `server said: ${body.error}`).toBe(200);
    expect(body).toMatchObject({ amountCents: 4333, total: 43.33, captureMethod: 'automatic' });
    expect(body.clientSecret).toMatch(/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/);
  });

  test('payment server rejects a bad order', async ({ request }) => {
    const res = await request.post('/api/create-payment-intent', { data: { mode: 'delivery', items: [{ id: 25, q: 1 }] } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Delivery needs a minimum order of $35.00.');
  });

  test('shopper can search, add to cart and see totals @mobile', async ({ page }) => {
    await openStore(page);
    await page.getByRole('searchbox', { name: 'Search products' }).fill('sourdough');
    await page.getByRole('searchbox', { name: 'Search products' }).press('Enter');
    await expect(page.locator('.pname').first()).toHaveText('Sourdough Loaf');
    await page.locator('article.card').first().getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.locator('#count')).toHaveText('1');
    await page.locator('#cartBtn').click();
    await expect(page.getByRole('dialog', { name: 'Your cart' }).locator('.grand')).toHaveText('Estimated total$10.66');
  });

  test('checkout loads the Stripe payment form', async ({ page }) => {
    await openStore(page);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByLabel('Password').fill('Fresh123');
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#acct')).toHaveText('Hi, Demo');
    // The demo account's cart is saved in the database, so earlier runs may have left items in it: start empty
    expect((await page.request.put('/api/cart', { data: { items: {} } })).status()).toBe(200);
    await page.evaluate(() => localStorage.removeItem('fm-cart'));
    await page.reload();
    await expect(page.locator('#count')).toHaveText('0');

    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await page.locator('article.card').filter({ hasText: 'Sourdough Loaf' }).getByRole('button', { name: 'Add to cart' }).click();
    await page.locator('#cartBtn').click();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();

    const co = page.getByRole('dialog', { name: 'Checkout' });
    await co.getByRole('button', { name: 'Curbside pickup' }).click();
    // Pick the first open slot, moving to the next day if today has none left
    const days = co.getByRole('group', { name: 'Day' }).getByRole('button');
    const open = co.getByRole('group', { name: 'Time' }).locator('button:not([disabled])');
    for (let d = 0; d < 7 && (await open.count()) === 0; d++) await days.nth(d + 1).click();
    await open.first().click();
    await co.getByRole('button', { name: 'Continue to payment' }).click();

    await expect(co.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
    await expect(co.locator('#pay-loaderr')).toHaveCount(0);
    // Stripe's form lives in an iframe served by js.stripe.com
    await expect(co.locator('#pay-el iframe[src*="js.stripe.com"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(co.getByLabel('Card number')).toHaveCount(0); // the demo form is not shown
  });
});
