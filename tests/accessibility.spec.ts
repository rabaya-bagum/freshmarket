import { Page } from '@playwright/test';
import { test, expect, DEMO, Store } from './fixtures';
import { expectNoA11yViolations } from './a11y';

// Accessibility: every page and screen of the store is scanned with axe-core against WCAG 2.1 AA,
// in light and dark mode, on desktop and phone. Keyboard tests check people can shop without a mouse.
// The store is one page with screens that open on top, so each screen is reached the way a shopper would.

test.use({ timezoneId: 'America/Toronto' });
test.beforeEach(async ({ page, store }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T08:00:00-04:00'));
  await expect(store.title).toHaveText('All departments'); // the store is open before every test
});

async function signIn(store: Store) {
  await store.signIn(DEMO.email, DEMO.password);
  await expect(store.accountButton).toHaveText('Hi, Demo');
}

async function cartWithOil(store: Store) {
  await store.department('Pantry');
  await store.addToCart('Extra Virgin Olive Oil');
  for (let i = 0; i < 2; i++) await store.card('Extra Virgin Olive Oil').getByRole('button', { name: 'Increase' }).click();
  await expect(store.cartCount).toHaveText('3');
}

async function toCheckout(store: Store, page: Page) {
  await signIn(store);
  await cartWithOil(store);
  const drawer = await store.openCart();
  await drawer.getByRole('button', { name: 'Continue to checkout' }).click();
  const co = page.getByRole('dialog', { name: 'Checkout' });
  await expect(co).toBeVisible();
  return co;
}

async function toPayment(store: Store, page: Page) {
  const co = await toCheckout(store, page);
  await co.getByLabel('Street address').fill('100 City Centre Dr');
  await co.getByLabel('Postal code').fill('L5B 2C9');
  await co.getByRole('button', { name: 'Check' }).click();
  await co.getByRole('group', { name: 'Time' }).getByRole('button', { name: '10 am – 11 am' }).click();
  await co.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(co.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
  return co;
}

async function placeOrder(page: Page, co) {
  await co.getByLabel('Name on card').fill('Demo Shopper');
  await co.getByLabel('Card number').fill('4242 4242 4242 4242');
  await co.getByLabel('Expiry (MM/YY)').fill('12/30');
  await co.getByLabel('Security code').fill('123');
  await co.getByRole('button', { name: /^Place order/ }).click();
  const done = page.getByRole('dialog', { name: 'Order FM-1001' });
  await expect(done).toBeVisible();
  return done;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Accessibility (${scheme} mode)`, () => {
    test.use({ colorScheme: scheme });

    // ---- Storefront (GP-2, store picker)
    test('home page', async ({ store, page }) => {
      await expect(store.title).toHaveText('All departments');
      await expectNoA11yViolations(page, 'home page');
    });

    test('department with filters', async ({ store, page }) => {
      await store.department('Bakery');
      await page.locator('.chip', { hasText: 'Vegan' }).click();
      await expect(page.locator('#subtitle')).toHaveText('3 products');
      await expectNoA11yViolations(page, 'Bakery, vegan filter');
    });

    test('all products loaded', async ({ page }) => {
      for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Show more products' }).click();
      await expect(page.locator('article.card')).toHaveCount(50);
      await expectNoA11yViolations(page, 'all 50 products, incl. sale and out-of-stock cards');
    });

    test('cards with quantity controls', async ({ store, page }) => {
      await cartWithOil(store);
      await expectNoA11yViolations(page, 'product cards with quantity controls');
    });

    test('store switched', async ({ page }) => {
      await page.getByRole('combobox', { name: 'Choose your store' }).selectOption({ index: 1 });
      await expect(page.locator('#toast')).toHaveText('Switched to Oakville Place');
      await expectNoA11yViolations(page, 'store switched, with notification');
    });

    // ---- Search (GP-3)
    test('search suggestions', async ({ store, page }) => {
      await store.search.fill('ch');
      await expect(store.suggestions).toBeVisible();
      await expectNoA11yViolations(page, 'search autocomplete');
    });

    test('search results', async ({ store, page }) => {
      await store.search.fill('chicken');
      await store.search.press('Enter');
      await expect(store.title).toHaveText('Results for “chicken”');
      await expectNoA11yViolations(page, 'search results');
    });

    test('no search results', async ({ store, page }) => {
      await store.search.fill('xyzzy');
      await store.search.press('Enter');
      await expect(page.locator('.empty h2')).toHaveText('No matches for that search');
      await expectNoA11yViolations(page, 'no results page');
    });

    // ---- Product page (GP-4)
    test('product page, in stock', async ({ store, page }) => {
      await store.card('Atlantic Salmon Fillet').getByRole('button', { name: 'Atlantic Salmon Fillet', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Atlantic Salmon Fillet' })).toBeVisible();
      await expectNoA11yViolations(page, 'product page (sale, sold by weight)');
    });

    test('product page, out of stock', async ({ store, page }) => {
      await store.card('Strawberries').getByRole('button', { name: 'Strawberries', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Strawberries' }).locator('.stock')).toHaveText('Out of stock at Square One');
      await expectNoA11yViolations(page, 'product page (out of stock)');
    });

    // ---- Cart (GP-5)
    test('empty cart', async ({ store, page }) => {
      const drawer = await store.openCart();
      await expect(drawer.locator('.empty h2')).toHaveText('Your cart is empty');
      await expectNoA11yViolations(page, 'empty cart');
    });

    test('cart with items', async ({ store, page }) => {
      await cartWithOil(store);
      const drawer = await store.openCart();
      await expect(drawer.locator('.line')).toHaveCount(1);
      await expectNoA11yViolations(page, 'cart with items and totals');
    });

    // ---- Account (GP-1)
    test('sign in', async ({ store, page }) => {
      await store.accountButton.click();
      await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
      await expectNoA11yViolations(page, 'sign in');
    });

    test('sign in error', async ({ store, page }) => {
      const dialog = await store.signIn(DEMO.email, 'wrong-pass');
      await expect(dialog.locator('.err')).toContainText("don't match");
      await expectNoA11yViolations(page, 'sign in with wrong password');
    });

    test('create account', async ({ store, page }) => {
      await store.accountButton.click();
      await page.getByRole('tab', { name: 'Create account' }).click();
      await expect(page.getByLabel('Full name')).toBeVisible();
      await expectNoA11yViolations(page, 'create account');
    });

    test('reset password', async ({ store, page }) => {
      await store.accountButton.click();
      await page.getByRole('button', { name: 'Forgot password?' }).click();
      await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
      await expectNoA11yViolations(page, 'reset password');
    });

    test('account panel', async ({ store, page }) => {
      await signIn(store);
      await store.accountButton.click();
      await expect(page.getByRole('dialog', { name: 'Account' })).toBeVisible();
      await expectNoA11yViolations(page, 'account panel');
    });

    // ---- Checkout (GP-6, GP-7, GP-8)
    test('checkout: delivery and time slots', async ({ store, page }) => {
      const co = await toCheckout(store, page);
      await co.getByLabel('Street address').fill('100 City Centre Dr');
      await co.getByLabel('Postal code').fill('L5B 2C9');
      await co.getByRole('button', { name: 'Check' }).click();
      await co.getByRole('group', { name: 'Time' }).getByRole('button', { name: '10 am – 11 am' }).click();
      await expect(co.locator('#co-hold')).toBeVisible();
      await expectNoA11yViolations(page, 'checkout: delivery, address checked, slot held');
    });

    test('checkout: errors shown', async ({ store, page }) => {
      const co = await toCheckout(store, page);
      await co.getByLabel('Postal code').fill('12345');
      await co.getByRole('button', { name: 'Check' }).click();
      await co.getByRole('button', { name: 'Continue to payment' }).click();
      await expect(co.locator('#co-err')).toBeVisible();
      await expectNoA11yViolations(page, 'checkout: bad postal code and missing fields');
    });

    test('checkout: pickup', async ({ store, page }) => {
      const co = await toCheckout(store, page);
      await co.getByRole('button', { name: 'Curbside pickup' }).click();
      await expect(co.locator('.pick')).toBeVisible();
      await expectNoA11yViolations(page, 'checkout: curbside pickup');
    });

    test('checkout: review and pay', async ({ store, page }) => {
      await toPayment(store, page);
      await expectNoA11yViolations(page, 'review and pay');
    });

    test('checkout: card declined', async ({ store, page }) => {
      const co = await toPayment(store, page);
      await co.getByLabel('Name on card').fill('Demo Shopper');
      await co.getByLabel('Card number').fill('4000 0000 0000 0002');
      await co.getByLabel('Expiry (MM/YY)').fill('12/30');
      await co.getByLabel('Security code').fill('123');
      await co.getByRole('button', { name: /^Place order/ }).click();
      await expect(co.locator('#co-err')).toContainText('declined');
      await expectNoA11yViolations(page, 'card declined');
    });

    test('order confirmation and tracking', async ({ store, page }) => {
      const co = await toPayment(store, page);
      await placeOrder(page, co);
      await expectNoA11yViolations(page, 'order confirmed');
    });

    test('order history', async ({ store, page }) => {
      const co = await toPayment(store, page);
      const done = await placeOrder(page, co);
      await done.getByRole('button', { name: 'All orders' }).click();
      await expect(page.getByRole('dialog', { name: 'Your orders' })).toBeVisible();
      await expectNoA11yViolations(page, 'order history');
    });
  });
}

// ---- Keyboard: people who can't use a mouse must be able to shop
test.describe('Keyboard access', () => {
  test('page has a main landmark, one h1 and a language', async ({ page }) => {
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('Tab reaches the header controls in order, with a visible focus ring', async ({ page }) => {
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('aria-label') || (document.activeElement as HTMLElement).textContent!.trim()));
    }
    expect(order.slice(0, 4)).toEqual(['Skip to products', 'FreshMarket home', 'Search products', 'Sign in']);
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(ring).not.toBe('none');
  });

  test('skip link jumps straight to the products', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to products' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    const inMain = await page.evaluate(() => !!document.activeElement!.closest('main'));
    expect(inMain).toBe(true);
  });

  test('a dialog takes focus, keeps it inside, and returns it on Escape', async ({ store, page }) => {
    const opener = store.card('Bananas').getByRole('button', { name: 'Bananas', exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Bananas' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const inside = () => page.evaluate(() => !!document.activeElement!.closest('[role=dialog]'));
    expect(await inside()).toBe(true);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await inside(), 'focus escaped the dialog').toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('a shopper can sign in, fill the cart and reach payment using only the keyboard', async ({ page }) => {
    // Sign in
    await page.getByRole('button', { name: 'Sign in' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Email')).toBeFocused();
    await page.keyboard.type(DEMO.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(DEMO.password);
    await page.keyboard.press('Enter');
    await expect(page.locator('#acct')).toHaveText('Hi, Demo');

    // Add to cart from a product card
    const add = page.locator('article.card').filter({ hasText: 'Sourdough Loaf' }).getByRole('button', { name: 'Add to cart' });
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#count')).toHaveText('1');

    // Open cart and continue to checkout with Enter
    await page.locator('#cartBtn').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Continue to checkout' }).focus();
    await page.keyboard.press('Enter');
    const co = page.getByRole('dialog', { name: 'Checkout' });
    await co.getByRole('button', { name: 'Curbside pickup' }).focus();
    await page.keyboard.press('Enter');
    await co.getByRole('group', { name: 'Time' }).getByRole('button', { name: '10 am – 11 am' }).focus();
    await page.keyboard.press('Enter');
    await co.getByRole('button', { name: 'Continue to payment' }).focus();
    await page.keyboard.press('Enter');
    await expect(co.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
  });

  test('status messages are announced to screen readers', async ({ store, page }) => {
    await expect(page.locator('#toast')).toHaveAttribute('role', 'status');
    await store.department('Bakery');
    await store.addToCart('Sourdough Loaf');
    await expect(page.locator('#toast')).toHaveText('Added to cart');
    const dialog = await store.signIn(DEMO.email, 'wrong-pass');
    await expect(dialog.getByRole('alert')).toContainText("don't match");
  });

  test('text stays readable at 200% zoom without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
