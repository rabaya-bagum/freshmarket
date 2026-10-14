import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { test, expect, DEMO } from './fixtures';

// GP-7 with real payments switched on. Stripe.js and the /api endpoints are replaced
// with stand-ins, so these tests check our checkout code without the network or a Stripe account.
test.use({ timezoneId: 'America/Toronto' });

type Outcome = 'succeeded' | 'requires_capture' | 'card_declined' | 'incomplete';

async function fakeStripe(page: Page, outcome: Outcome, opts: { serverAmount?: number; serverError?: string } = {}) {
  const intents: unknown[] = [];
  await page.clock.setFixedTime(new Date('2026-10-14T08:00:00-04:00'));
  await page.route('**/api/config', (r) => r.fulfill({ json: { stripe: true, publishableKey: 'pk_test_fake', testMode: true } }));
  await page.route('**/api/create-payment-intent', async (r) => {
    intents.push(r.request().postDataJSON());
    if (opts.serverError) return r.fulfill({ status: 400, json: { error: opts.serverError } });
    await r.fulfill({ json: { clientSecret: 'pi_123_secret_x', amountCents: opts.serverAmount ?? 4832, total: 48.32, captureMethod: 'automatic' } });
  });
  await page.route('https://js.stripe.com/v3/', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: `window.__stripe = { elementsOptions: null, confirmCalls: 0 };
        window.Stripe = function (pk) {
          window.__stripe.pk = pk;
          return {
            elements(o) {
              window.__stripe.elementsOptions = o;
              return {
                create() { return { mount(el) { el.innerHTML = '<div data-testid="stripe-element">Card details (Stripe)</div>'; } }; },
                async submit() { return ${outcome === 'incomplete' ? `{ error: { message: 'Your card number is incomplete.' } }` : '{}'}; },
              };
            },
            async confirmPayment(args) {
              window.__stripe.confirmCalls++;
              window.__stripe.clientSecret = args.clientSecret;
              ${outcome === 'card_declined'
                ? `return { error: { type: 'card_error', message: 'Your card was declined.' } };`
                : `return { paymentIntent: { id: 'pi_123', status: '${outcome}' } };`}
            },
          };
        };`,
    })
  );
  return intents;
}

async function toPayment(store, page: Page) {
  await page.reload(); // pick up the faked /api/config
  await store.signIn(DEMO.email, DEMO.password);
  await expect(store.accountButton).toHaveText('Hi, Demo');
  await store.department('Pantry');
  await store.addToCart('Extra Virgin Olive Oil');
  for (let i = 0; i < 2; i++) await store.card('Extra Virgin Olive Oil').getByRole('button', { name: 'Increase' }).click();
  const drawer = await store.openCart();
  await drawer.getByRole('button', { name: 'Continue to checkout' }).click();
  const co = page.getByRole('dialog', { name: 'Checkout' });
  await co.getByLabel('Street address').fill('100 City Centre Dr');
  await co.getByLabel('Postal code').fill('L5B 2C9');
  await co.getByRole('button', { name: 'Check' }).click();
  await co.getByRole('group', { name: 'Time' }).getByRole('button', { name: '10 am – 11 am' }).click();
  await co.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(co.getByTestId('stripe-element')).toBeVisible();
  return co;
}

test.describe('GP-7 Stripe payments', () => {
  test('shows the Stripe payment form instead of the demo card fields', async ({ store, page }) => {
    await fakeStripe(page, 'succeeded');
    const co = await toPayment(store, page);
    await expect(co.getByLabel('Card number')).toHaveCount(0);
    await expect(co.getByRole('radio')).toHaveCount(0);
    await expect(co).toContainText('Stripe test mode: use 4242 4242 4242 4242');
    const opts = await page.evaluate(() => (window as any).__stripe.elementsOptions);
    expect(opts).toMatchObject({ mode: 'payment', amount: 4832, currency: 'cad', captureMethod: 'automatic' });
    expect(await page.evaluate(() => (window as any).__stripe.pk)).toBe('pk_test_fake');
  });

  test('sends only product IDs and quantities to the server, then confirms with Stripe', async ({ store, page }) => {
    const intents = await fakeStripe(page, 'succeeded');
    const co = await toPayment(store, page);
    await co.getByRole('button', { name: /^Place order/ }).click();

    const done = page.getByRole('dialog', { name: 'Order FM-1001' });
    await expect(done.getByRole('heading')).toHaveText('Order FM-1001 confirmed');
    await expect(done).toContainText('Paid with Stripe (test mode).');
    expect(intents).toEqual([{ mode: 'delivery', items: [{ id: expect.any(Number), q: 3 }] }]);
    expect(await page.evaluate(() => (window as any).__stripe.clientSecret)).toBe('pi_123_secret_x');
    await expect(store.cartCount).toHaveText('0');
  });

  test('a declined card shows Stripe’s message and keeps the cart', async ({ store, page }) => {
    await fakeStripe(page, 'card_declined');
    const co = await toPayment(store, page);
    const pay = co.getByRole('button', { name: /^Place order/ });
    await pay.click();
    await expect(co.locator('#co-err')).toHaveText('Your card was declined.');
    await expect(pay).toBeEnabled();
    await expect(pay).toHaveText('Place order · $48.32');
    await expect(store.cartCount).toHaveText('3');
    await expect(co.getByTestId('stripe-element')).toBeVisible(); // form kept, no need to start over
  });

  test('incomplete card details stop before contacting the server', async ({ store, page }) => {
    const intents = await fakeStripe(page, 'incomplete');
    const co = await toPayment(store, page);
    await co.getByRole('button', { name: /^Place order/ }).click();
    await expect(co.locator('#co-err')).toHaveText('Your card number is incomplete.');
    expect(intents).toHaveLength(0);
  });

  test('a server error is shown and nothing is charged', async ({ store, page }) => {
    await fakeStripe(page, 'succeeded', { serverError: 'Delivery needs a minimum order of $35.00.' });
    const co = await toPayment(store, page);
    await co.getByRole('button', { name: /^Place order/ }).click();
    await expect(co.locator('#co-err')).toHaveText('Delivery needs a minimum order of $35.00.');
    expect(await page.evaluate(() => (window as any).__stripe.confirmCalls)).toBe(0);
  });

  test('stops if the server price differs from what the shopper saw', async ({ store, page }) => {
    await fakeStripe(page, 'succeeded', { serverAmount: 9999 });
    const co = await toPayment(store, page);
    await co.getByRole('button', { name: /^Place order/ }).click();
    await expect(co.locator('#co-err')).toHaveText('Prices changed while you were checking out. Go back and review your order.');
    expect(await page.evaluate(() => (window as any).__stripe.confirmCalls)).toBe(0);
  });

  test('weighted items are authorized now and captured after picking', async ({ store, page }) => {
    await fakeStripe(page, 'requires_capture', { serverAmount: 6223 });
    await page.reload();
    await store.signIn(DEMO.email, DEMO.password);
    await store.department('Pantry');
    await store.addToCart('Extra Virgin Olive Oil');
    for (let i = 0; i < 2; i++) await store.card('Extra Virgin Olive Oil').getByRole('button', { name: 'Increase' }).click();
    await store.department('Meat & Seafood');
    await store.addToCart('Chicken Breasts');
    const drawer = await store.openCart();
    await drawer.getByRole('button', { name: 'Continue to checkout' }).click();
    const co = page.getByRole('dialog', { name: 'Checkout' });
    await co.getByLabel('Street address').fill('100 City Centre Dr');
    await co.getByLabel('Postal code').fill('L5B 2C9');
    await co.getByRole('button', { name: 'Check' }).click();
    await co.getByRole('group', { name: 'Time' }).getByRole('button', { name: '10 am – 11 am' }).click();
    await co.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(co.getByTestId('stripe-element')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__stripe.elementsOptions)).toMatchObject({ amount: 6223, captureMethod: 'manual' });

    await co.getByRole('button', { name: /^Place order/ }).click();
    await expect(page.getByRole('dialog', { name: 'Order FM-1001' }).getByRole('heading')).toHaveText('Order FM-1001 confirmed');
  });

  test('falls back to demo payment when Stripe is not set up', async ({ store, page }) => {
    await page.clock.setFixedTime(new Date('2026-10-14T08:00:00-04:00'));
    await page.route('**/api/config', (r) => r.fulfill({ status: 404, body: 'Not found' }));
    await page.reload();
    await store.signIn(DEMO.email, DEMO.password);
    await store.department('Bakery');
    await store.addToCart('Sourdough Loaf');
    const drawer = await store.openCart();
    await drawer.getByRole('button', { name: 'Continue to checkout' }).click();
    const co = page.getByRole('dialog', { name: 'Checkout' });
    await co.getByRole('button', { name: 'Curbside pickup' }).click();
    await co.getByRole('group', { name: 'Time' }).getByRole('button').first().click();
    await co.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(co.getByLabel('Card number')).toBeVisible();
    await expect(co.getByTestId('stripe-element')).toHaveCount(0);
  });
});

test('server price list matches the store’s prices', async ({ store, page }) => {
  await expect(store.title).toHaveText('All departments');
  const prices = JSON.parse(readFileSync('data/prices.json', 'utf8'));
  const shop = await page.evaluate(() => (window as any).FM_PRODUCTS.map((p) => ({ id: p.id, name: p.name, price: p.price, per: p.per || null })));
  expect(shop).toEqual(prices);
});
