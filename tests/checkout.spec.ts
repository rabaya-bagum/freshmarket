import { Page } from '@playwright/test';
import { test, expect, DEMO } from './fixtures';

// GP-6 time slots · GP-7 payment · GP-8 confirmation, tracking and history.
// The clock is fixed to a Wednesday at 8 am Toronto time so the slot list never depends on when CI runs.
const NOW = new Date('2026-10-14T08:00:00-04:00');
test.use({ timezoneId: 'America/Toronto' });
test.beforeEach(async ({ page }) => page.clock.setFixedTime(NOW));

const checkout = (page: Page) => page.getByRole('dialog', { name: 'Checkout' });

async function fillCart(store, items: [string, string, number][]) {
  for (const [dept, name, qty] of items) {
    await store.department(dept);
    await store.addToCart(name);
    for (let i = 1; i < qty; i++) await store.card(name).getByRole('button', { name: 'Increase' }).click();
  }
}

/** Signs in, fills the cart and opens checkout. */
async function startCheckout(store, items: [string, string, number][]) {
  await store.signIn(DEMO.email, DEMO.password);
  await expect(store.accountButton).toHaveText('Hi, Demo');
  await fillCart(store, items);
  const drawer = await store.openCart();
  await drawer.getByRole('button', { name: 'Continue to checkout' }).click();
  await expect(checkout(store.page)).toBeVisible();
  return checkout(store.page);
}

const OLIVE_OIL_x3: [string, string, number][] = [['Pantry', 'Extra Virgin Olive Oil', 3]]; // $41.97
const SOURDOUGH: [string, string, number][] = [['Bakery', 'Sourdough Loaf', 1]]; // $5.49

async function chooseSlot(co, time = '10 am – 11 am') {
  await co.getByRole('group', { name: 'Time' }).getByRole('button', { name: time }).click();
  await expect(co.locator('#co-hold')).toContainText('until 8:30 am');
}

async function deliveryAddress(co, postal = 'L5B 2C9') {
  await co.getByLabel('Street address').fill('100 City Centre Dr');
  await co.getByLabel('Postal code').fill(postal);
  await co.getByRole('button', { name: 'Check' }).click();
}

async function payByCard(co, number = '4242 4242 4242 4242', exp = '12/30', cvc = '123') {
  await co.getByLabel('Name on card').fill('Demo Shopper');
  await co.getByLabel('Card number').fill(number);
  await co.getByLabel('Expiry (MM/YY)').fill(exp);
  await co.getByLabel('Security code').fill(cvc);
  await co.getByRole('button', { name: /^Place order/ }).click();
}

test.describe('GP-6 Choose pickup or delivery time slot', () => {
  test('guests must sign in before checkout', async ({ store, page }) => {
    await fillCart(store, SOURDOUGH);
    const drawer = await store.openCart();
    await drawer.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
    await expect(checkout(page)).toHaveCount(0);
  });

  test('shows the next 7 days, starting today', async ({ store }) => {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    const days = co.getByRole('group', { name: 'Day' }).getByRole('button');
    await expect(days).toHaveCount(7);
    await expect(days.first()).toHaveText('Today');
    await expect(days.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(days.nth(1)).toHaveText('Thu, Oct 15');
    await expect(days.last()).toHaveText('Tue, Oct 20');
  });

  test('offers 1-hour slots and disables full ones', async ({ store }) => {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    const slots = co.getByRole('group', { name: 'Time' }).getByRole('button');
    await expect(slots).toHaveCount(10); // 10 am to 8 pm
    await expect(slots.first()).toHaveText('10 am – 11 am');
    await expect(slots.last()).toHaveText(/^7 pm – 8 pm/);
    const full = co.getByRole('group', { name: 'Time' }).getByRole('button', { name: /Full/ });
    await expect(full).toHaveCount(2);
    for (const b of await full.all()) await expect(b).toBeDisabled();
  });

  test('hides slots that start in less than 2 hours', async ({ store, page }) => {
    await page.clock.setFixedTime(new Date('2026-10-14T15:30:00-04:00'));
    const co = await startCheckout(store, OLIVE_OIL_x3);
    await expect(co.getByRole('group', { name: 'Time' }).getByRole('button').first()).toHaveText('6 pm – 7 pm');
  });

  test('holds the chosen slot for 30 minutes', async ({ store }) => {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    const slot = co.getByRole('group', { name: 'Time' }).getByRole('button', { name: '10 am – 11 am' });
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
    await expect(co.locator('#co-hold')).toHaveText("We're holding Wed, Oct 14, 10 am – 11 am for you until 8:30 am.");
  });

  test('changing the day clears the chosen slot', async ({ store }) => {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    await chooseSlot(co);
    await co.getByRole('group', { name: 'Day' }).getByRole('button', { name: 'Thu, Oct 15' }).click();
    await expect(co.locator('#co-hold')).toHaveCount(0);
    await expect(co.getByRole('group', { name: 'Time' }).locator('[aria-pressed="true"]')).toHaveCount(0);
  });

  test('accepts a postal code in the delivery area', async ({ store }) => {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    await deliveryAddress(co, 'l5b2c9');
    await expect(co.locator('#co-zip')).toHaveText('We deliver to L5B 2C9.');
    await expect(co.getByLabel('Postal code')).toHaveValue('L5B 2C9');
  });

  test('rejects a postal code outside the delivery area', async ({ store }) => {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    await deliveryAddress(co, 'M5V 1A1');
    await expect(co.locator('#co-zip')).toHaveText("We don't deliver to M5V 1A1 from Square One yet. Choose pickup or another store.");
  });

  test('rejects a badly formatted postal code', async ({ store }) => {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    await deliveryAddress(co, '12345');
    await expect(co.locator('#co-zip')).toHaveText('Enter a postal code like L5B 2C9.');
  });

  test('shows the delivery fee and minimum order before confirming', async ({ store }) => {
    const co = await startCheckout(store, SOURDOUGH);
    await expect(co).toContainText('$4.99 fee, free over $50.00 · minimum order $35.00');
    await expect(co.locator('#co-min')).toHaveText('Delivery needs a minimum order of $35.00. Add $29.51 more or choose pickup.');
  });

  test('blocks delivery under the minimum order', async ({ store }) => {
    const co = await startCheckout(store, SOURDOUGH);
    await deliveryAddress(co);
    await chooseSlot(co);
    await co.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(co.locator('#co-err')).toHaveText('Delivery needs a minimum order of $35.00.');
    await expect(co.getByRole('heading', { name: 'Review and pay' })).toHaveCount(0);
  });

  test('pickup has no minimum and no fee', async ({ store }) => {
    const co = await startCheckout(store, SOURDOUGH);
    await co.getByRole('button', { name: 'Curbside pickup' }).click();
    await expect(co.locator('.pick')).toContainText('FreshMarket Square One');
    await expect(co.locator('.pick')).toContainText('100 City Centre Dr, Mississauga, ON L5B 2C9');
    await expect(co.locator('#co-min')).toHaveCount(0);
    await expect(co.locator('.cofoot')).toContainText('Estimated total $5.67');
  });

  test('requires address, postal check and a time before payment', async ({ store }) => {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    const next = co.getByRole('button', { name: 'Continue to payment' });
    await next.click();
    await expect(co.locator('#co-err')).toHaveText('Enter your street address.');
    await co.getByLabel('Street address').fill('100 City Centre Dr');
    await next.click();
    await expect(co.locator('#co-err')).toHaveText('Check your postal code for delivery.');
    await co.getByLabel('Postal code').fill('L5B 2C9');
    await next.click();
    await expect(co.locator('#co-err')).toHaveText('Choose a delivery or pickup time.');
    await chooseSlot(co);
    await next.click();
    await expect(co.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
  });
});

test.describe('GP-7 Secure checkout and payment', () => {
  async function toPayment(store, items = OLIVE_OIL_x3) {
    const co = await startCheckout(store, items);
    await deliveryAddress(co);
    await chooseSlot(co);
    await co.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(co.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
    return co;
  }

  test('order review shows items, slot, address, fees, HST and total', async ({ store }) => {
    const co = await toPayment(store);
    await expect(co.locator('#co-when')).toHaveText('Wed, Oct 14, 10 am – 11 am');
    await expect(co.locator('#co-where')).toHaveText('100 City Centre Dr, L5B 2C9');
    await expect(co.locator('.items li')).toHaveText([/Extra Virgin Olive Oil × 3\s*\$41\.97/]);
    const totals = co.locator('.co-totals');
    await expect(totals).toContainText('Subtotal$41.97');
    await expect(totals).toContainText('HST$1.36');
    await expect(totals).toContainText('Delivery fee$4.99');
    await expect(totals.locator('.grand')).toHaveText('Total$48.32');
    await expect(co.getByRole('button', { name: /^Place order/ })).toHaveText('Place order · $48.32');
  });

  test('approves a valid card and places the order', async ({ store }) => {
    const co = await toPayment(store);
    await payByCard(co);
    const done = store.page.getByRole('dialog', { name: 'Order FM-1001' });
    await expect(done.getByRole('heading')).toHaveText('Order FM-1001 confirmed');
    await expect(done).toContainText('Paid with card ending in 4242.');
    await expect(store.cartCount).toHaveText('0');
  });

  test('declined card shows a clear message and keeps the cart', async ({ store }) => {
    const co = await toPayment(store);
    await payByCard(co, '4000 0000 0000 0002');
    await expect(co.locator('#co-err')).toHaveText('Your card was declined. Try another card or payment method.');
    await expect(co.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
    await expect(store.cartCount).toHaveText('3');
  });

  test('validates card number, expiry and security code', async ({ store }) => {
    const co = await toPayment(store);
    const err = co.locator('#co-err');
    await payByCard(co, '4242 4242 4242 4241');
    await expect(err).toHaveText('Check the card number. It should be 13 to 19 digits.');
    await payByCard(co, '4242 4242 4242 4242', '13/30');
    await expect(err).toHaveText('Enter the expiry as MM/YY.');
    await payByCard(co, '4242 4242 4242 4242', '09/26');
    await expect(err).toHaveText('This card has expired. Use another card.');
    await payByCard(co, '4242 4242 4242 4242', '12/30', '12');
    await expect(err).toHaveText('Enter the 3 or 4 digit security code.');
  });

  test('requires the name on the card', async ({ store }) => {
    const co = await toPayment(store);
    await co.getByLabel('Card number').fill('4242 4242 4242 4242');
    await co.getByRole('button', { name: /^Place order/ }).click();
    await expect(co.locator('#co-err')).toHaveText('Enter the name on the card.');
  });

  test('pays with Apple Pay or Google Pay', async ({ store }) => {
    const co = await toPayment(store);
    await co.getByLabel('Google Pay').check();
    await expect(co.getByLabel('Card number')).toHaveCount(0);
    await expect(co).toContainText("You'll confirm the payment in Google Pay.");
    await co.getByRole('button', { name: /^Place order/ }).click();
    await expect(store.page.getByRole('dialog', { name: 'Order FM-1001' })).toContainText('Paid with Google Pay.');
  });

  test('pre-authorizes extra for items sold by weight', async ({ store }) => {
    const co = await toPayment(store, [['Pantry', 'Extra Virgin Olive Oil', 3], ['Meat & Seafood', 'Chicken Breasts', 1]]);
    // total = 41.97 + 7.99 = 49.96 subtotal, HST 1.62, delivery 4.99 → 56.57; hold 110% → 62.23
    await expect(co.locator('.grand')).toHaveText('Total$56.57');
    await expect(co.locator('#co-preauth')).toHaveText(
      "Some items are sold by weight. We'll pre-authorize $62.23 and charge the actual amount when your order is picked."
    );
  });

  test('no pre-authorization note without weighted items', async ({ store }) => {
    const co = await toPayment(store);
    await expect(co.locator('#co-preauth')).toHaveCount(0);
  });

  test('an expired slot hold sends you back to choose a time', async ({ store, page }) => {
    const co = await toPayment(store);
    await page.clock.setFixedTime(new Date('2026-10-14T08:31:00-04:00'));
    await payByCard(co);
    await expect(co.locator('#co-err')).toHaveText('Your time slot hold expired. Choose a time again.');
    await expect(co.getByRole('heading', { name: 'How would you like your order?' })).toBeVisible();
    await expect(store.cartCount).toHaveText('3');
  });

  test('Back returns to the time step with choices kept', async ({ store }) => {
    const co = await toPayment(store);
    await co.getByRole('button', { name: 'Back' }).click();
    await expect(co.getByLabel('Street address')).toHaveValue('100 City Centre Dr');
    await expect(co.getByRole('group', { name: 'Time' }).getByRole('button', { name: '10 am – 11 am' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('GP-8 Order confirmation, tracking and history', () => {
  async function placeDeliveryOrder(store) {
    const co = await startCheckout(store, OLIVE_OIL_x3);
    await deliveryAddress(co);
    await chooseSlot(co);
    await co.getByRole('button', { name: 'Continue to payment' }).click();
    await payByCard(co);
    const done = store.page.getByRole('dialog', { name: 'Order FM-1001' });
    await expect(done).toBeVisible();
    return done;
  }

  test('confirmation shows order number, email and summary', async ({ store }) => {
    const done = await placeDeliveryOrder(store);
    await expect(done.getByRole('heading')).toHaveText('Order FM-1001 confirmed');
    await expect(done).toContainText('We emailed a confirmation to demo@freshmarket.ca.');
    await expect(done.locator('.items li')).toHaveText([/Extra Virgin Olive Oil × 3\s*\$41\.97/]);
    await expect(done.locator('.grand')).toHaveText('Total$48.32');
    await expect(done.locator('[aria-current="step"]').first()).toHaveText('Confirmed');
  });

  test('tracks status from Placed to Completed with notifications', async ({ store, page }) => {
    const done = await placeDeliveryOrder(store);
    const track = done.getByRole('list', { name: 'Order status' });
    await expect(track.getByRole('listitem')).toHaveText(['Placed', 'Picking', 'Out for delivery', 'Completed']);
    await expect(track.locator('[aria-current="step"]')).toHaveText('Placed');

    for (const next of ['Picking', 'Out for delivery', 'Completed']) {
      await page.getByRole('button', { name: 'Advance status (demo)' }).click();
      await expect(page.locator('#toast')).toHaveText(`Status update sent by email and SMS: ${next}`);
      await expect(page.getByRole('list', { name: 'Order status' }).locator('[aria-current="step"]')).toHaveText(next);
    }
    await expect(page.getByRole('button', { name: 'Advance status (demo)' })).toHaveCount(0);
  });

  test('pickup orders track "Ready for pickup"', async ({ store, page }) => {
    const co = await startCheckout(store, SOURDOUGH);
    await co.getByRole('button', { name: 'Curbside pickup' }).click();
    await chooseSlot(co);
    await co.getByRole('button', { name: 'Continue to payment' }).click();
    await payByCard(co);
    await expect(page.getByRole('list', { name: 'Order status' }).getByRole('listitem')).toHaveText(['Placed', 'Picking', 'Ready for pickup', 'Completed']);
  });

  test('order history lists past orders and survives sign-out', async ({ store, page }) => {
    const done = await placeDeliveryOrder(store);
    await done.getByRole('button', { name: 'Continue shopping' }).click();
    await page.reload(); // signed out, cart empty
    await store.signIn(DEMO.email, DEMO.password);
    await store.accountButton.click();
    await page.getByRole('button', { name: /^Your orders/ }).click();
    const list = page.getByRole('dialog', { name: 'Your orders' }).locator('.orders li');
    await expect(list).toHaveCount(1);
    await expect(list.first()).toContainText('FM-1001');
    await expect(list.first()).toContainText('3 items · $48.32');
    await expect(list.first().locator('.pill')).toHaveText('Placed');
  });

  test('order history is empty for a new account', async ({ store, page }) => {
    await store.signIn(DEMO.email, DEMO.password);
    await store.accountButton.click();
    await page.getByRole('button', { name: /^Your orders/ }).click();
    await expect(page.getByRole('dialog', { name: 'Your orders' }).locator('.empty h2')).toHaveText('No orders yet');
  });

  test('View receipt reopens the order', async ({ store, page }) => {
    const done = await placeDeliveryOrder(store);
    await done.getByRole('button', { name: 'All orders' }).click();
    await page.getByRole('button', { name: 'View receipt' }).click();
    const receipt = page.getByRole('dialog', { name: 'Order FM-1001' });
    await expect(receipt.getByRole('heading')).toHaveText('Order FM-1001');
    await expect(receipt).toContainText('Placed Oct 14, 2026');
    await expect(receipt.locator('.grand')).toHaveText('Total$48.32');
  });

  test('Reorder adds a past order back to the cart', async ({ store, page }) => {
    const done = await placeDeliveryOrder(store);
    await expect(store.cartCount).toHaveText('0');
    await done.getByRole('button', { name: 'All orders' }).click();
    await page.getByRole('button', { name: 'Reorder' }).click();
    await expect(page.locator('#toast')).toHaveText('Added 3 items to your cart.');
    await expect(store.cartCount).toHaveText('3');
  });

  test('order numbers increase with each order', async ({ store, page }) => {
    const done = await placeDeliveryOrder(store);
    await done.getByRole('button', { name: 'All orders' }).click();
    await page.getByRole('button', { name: 'Reorder' }).click();
    const drawer = await store.openCart();
    await drawer.getByRole('button', { name: 'Continue to checkout' }).click();
    const co = checkout(page);
    await co.getByRole('button', { name: 'Curbside pickup' }).click();
    await chooseSlot(co);
    await co.getByRole('button', { name: 'Continue to payment' }).click();
    await payByCard(co);
    await expect(page.getByRole('dialog', { name: 'Order FM-1002' }).getByRole('heading')).toHaveText('Order FM-1002 confirmed');
  });
});
