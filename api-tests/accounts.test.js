// Unit tests for accounts, carts and orders. Run with: npm run test:api
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, fakeStripe, PK, SK } = require('./helpers');

const OIL = 25; // Extra Virgin Olive Oil, $13.99
const STRAWBERRIES = 6; // out of stock at Square One
const delivery = (extra = {}) => ({
  store: 0, mode: 'delivery', items: [{ id: OIL, q: 3 }], when: 'Wed, Oct 14, 10 am – 11 am',
  street: '100 City Centre Dr', postal: 'L5B 2C9', paidWith: 'card ending in 4242', ...extra,
});

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.close());

describe('sign-in', () => {
  test('the demo account signs in and the session survives', async () => {
    const b = srv.browser();
    const r = await b.signIn();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.user, { name: 'Demo Shopper', email: 'demo@freshmarket.ca' });
    assert.match(r.cookies.join(), /fm_session=.+HttpOnly/i);
    assert.deepEqual((await b.call('GET', '/session')).body.user, { name: 'Demo Shopper', email: 'demo@freshmarket.ca' });
  });

  test('a fresh browser is signed out', async () => {
    assert.deepEqual((await srv.browser().call('GET', '/session')).body, { user: null });
  });

  test('a tampered session cookie is ignored', async () => {
    const b = srv.browser();
    await b.signIn();
    const [body, sig] = b.jar.get('fm_session').split('.');
    const forged = Buffer.from(JSON.stringify({ u: 1, exp: Date.now() + 1e9 })).toString('base64url');
    b.jar.set('fm_session', `${forged}.${sig}`);
    assert.equal((await b.call('GET', '/session')).body.user, null);
    b.jar.set('fm_session', `${body}.x${sig}`);
    assert.equal((await b.call('GET', '/session')).body.user, null);
  });

  test('checks the fields before looking up any account (GP-81)', async () => {
    const b = srv.browser();
    assert.equal((await b.signIn('', 'Fresh123')).body.error, 'Enter your email address.');
    assert.equal((await b.signIn('demo@', 'Fresh123')).body.error, 'Enter a valid email address, like name@example.com.');
    assert.equal((await b.signIn('demo@freshmarket.ca', '')).body.error, 'Enter your password.');
  });

  test('does not reveal whether an unknown email exists', async () => {
    const r = await srv.browser().signIn('nobody@nowhere.ca', 'whatever1');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "That email and password don't match.");
  });

  test('counts down, locks after 5 failures, and a reset unlocks it', async () => {
    const s = await startServer(); // its own demo account, so locking it can't affect other tests
    const b = s.browser();
    const msgs = [];
    for (let i = 0; i < 5; i++) msgs.push((await b.signIn('demo@freshmarket.ca', 'wrong-pass')).body.error);
    assert.deepEqual(msgs.slice(0, 2), [
      "That email and password don't match. 4 attempts left before the account locks.",
      "That email and password don't match. 3 attempts left before the account locks.",
    ]);
    assert.equal(msgs[4], "That email and password don't match.");
    const locked = await b.signIn();
    assert.equal(locked.status, 423);
    assert.match(locked.body.error, /locked after 5 failed attempts/);
    assert.equal((await b.call('POST', '/auth/reset', { email: 'demo@freshmarket.ca' })).status, 200);
    assert.equal((await b.signIn()).status, 200);
    await s.close();
  });
});

describe('accounts', () => {
  test('a new account must be verified, then signs in', async () => {
    const b = srv.browser();
    assert.equal((await b.call('POST', '/auth/signup', { name: 'New Shopper', email: 'New@Shopper.ca', password: 'Fresh2024' })).status, 201);
    const first = await b.signIn('new@shopper.ca', 'Fresh2024');
    assert.equal(first.status, 403);
    assert.equal(first.body.error, 'Verify your email first. We sent a link to new@shopper.ca.');
    const second = await b.signIn('new@shopper.ca', 'Fresh2024');
    assert.equal(second.status, 200);
    assert.equal(second.body.user.name, 'New Shopper');
  });

  test('refuses a duplicate email and a password without a number', async () => {
    const b = srv.browser();
    const dup = await b.call('POST', '/auth/signup', { name: 'Again', email: 'demo@freshmarket.ca', password: 'Fresh2024' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'An account with this email already exists. Sign in instead.');
    const weak = await b.call('POST', '/auth/signup', { name: 'Weak', email: 'weak@shopper.ca', password: 'freshfresh' });
    assert.equal(weak.body.error, 'Add at least one number to your password.');
  });

  test('passwords are stored as salted scrypt hashes', async () => {
    const { hashPassword, checkPassword } = require('../server/security');
    const h = await hashPassword('Secret123');
    assert.match(h, /^scrypt\$/);
    assert.ok(!h.includes('Secret123'));
    assert.equal(await checkPassword('Secret123', h), true);
    assert.equal(await checkPassword('Secret124', h), false);
  });

  test('sign-out ends the session', async () => {
    const b = srv.browser();
    await b.signIn();
    await b.call('POST', '/auth/signout');
    assert.equal((await b.call('GET', '/session')).body.user, null);
  });

  test('changes must be sent as JSON', async () => {
    const r = await srv.browser().call('POST', '/auth/signin', null, { raw: 'email=demo%40freshmarket.ca&password=Fresh123', type: 'application/x-www-form-urlencoded' });
    assert.equal(r.status, 415);
  });
});

describe('cart', () => {
  test('is saved to the account, and a guest cart joins it on sign-in', async () => {
    const s = await startServer();
    const phone = s.browser();
    await phone.signIn();
    assert.deepEqual((await phone.call('PUT', '/cart', { items: { [OIL]: 2, 999: 1, 13: 0 } })).body.cart, { [OIL]: 2 });

    const laptop = s.browser();
    const r = await laptop.signIn(undefined, undefined, { [OIL]: 1, 13: 4 });
    assert.deepEqual(r.body.cart, { [OIL]: 2, 13: 4 }); // larger quantity wins
    assert.deepEqual((await phone.call('GET', '/session')).body.cart, { [OIL]: 2, 13: 4 });
    await s.close();
  });

  test('needs a signed-in account', async () => {
    assert.equal((await srv.browser().call('PUT', '/cart', { items: {} })).status, 401);
  });
});

describe('orders', () => {
  test('prices the order on the server, numbers it, and clears the saved cart', async () => {
    const s = await startServer();
    const b = s.browser();
    await b.signIn();
    await b.call('PUT', '/cart', { items: { [OIL]: 3 } });
    const r = await b.call('POST', '/orders', delivery({ items: [{ id: OIL, q: 3, price: 0.01 }], total: 0.03 }));
    assert.equal(r.status, 201);
    assert.equal(r.body.order.id, 'FM-1001');
    assert.equal(r.body.order.total, 48.32);
    assert.equal(r.body.order.where, '100 City Centre Dr, L5B 2C9');
    assert.equal(r.body.order.status, 0);
    const session = (await b.call('GET', '/session')).body;
    assert.deepEqual(session.cart, {});
    assert.deepEqual(session.orders.map((o) => o.id), ['FM-1001']);
    assert.equal((await b.call('POST', '/orders', delivery())).body.order.id, 'FM-1002');
    await s.close();
  });

  for (const [label, order, status, error] of [
    ['under the delivery minimum', delivery({ items: [{ id: OIL, q: 1 }] }), 400, 'Delivery needs a minimum order of $35.00.'],
    ['outside the delivery area', delivery({ postal: 'M5V 2T6' }), 400, "We don't deliver to M5V 2T6 from Square One yet."],
    ['with no street address', delivery({ street: ' ' }), 400, 'Enter your street address.'],
    ['with no time', delivery({ when: '' }), 400, 'Choose a delivery or pickup time.'],
    ['for more than the store has', { ...delivery(), mode: 'pickup', items: [{ id: STRAWBERRIES, q: 1 }] }, 409, 'Strawberries is out of stock at Square One.'],
    ['with an unknown store', delivery({ store: 7 }), 400, 'Choose a store.'],
    ['with a made-up payment method', delivery({ paidWith: 'IOU' }), 400, 'Choose a payment method.'],
  ]) {
    test(`refuses an order ${label}`, async () => {
      const b = srv.browser();
      await b.signIn();
      const r = await b.call('POST', '/orders', order);
      assert.equal(r.status, status);
      assert.equal(r.body.error, error);
    });
  }

  test('needs a signed-in account', async () => {
    assert.equal((await srv.browser().call('POST', '/orders', delivery())).status, 401);
  });

  test('status moves one step at a time and stops at Completed', async () => {
    const b = srv.browser();
    await b.call('POST', '/auth/google');
    const { order } = (await b.call('POST', '/orders', { ...delivery(), mode: 'pickup' })).body;
    const names = [];
    for (let i = 0; i < 4; i++) names.push((await b.call('POST', `/orders/${order.id}/advance`)).body.statusName);
    assert.deepEqual(names, ['Picking', 'Ready for pickup', 'Completed', 'Completed']);
  });

  test("one shopper can't see or change another shopper's orders", async () => {
    const s = await startServer();
    const a = s.browser(), other = s.browser();
    await a.signIn();
    const { order } = (await a.call('POST', '/orders', delivery())).body;
    await other.call('POST', '/auth/google');
    assert.deepEqual((await other.call('GET', '/session')).body.orders, []);
    assert.equal((await other.call('POST', `/orders/${order.id}/advance`)).status, 404);
    await s.close();
  });
});

describe('orders with Stripe switched on', () => {
  let s, stripe;
  before(async () => {
    stripe = fakeStripe({ intents: { pi_ok: { status: 'succeeded', amount: 4832 }, pi_low: { status: 'succeeded', amount: 100 }, pi_open: { status: 'requires_payment_method', amount: 4832 } } });
    s = await startServer({ env: { STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: SK }, stripe });
  });
  after(() => s.close());

  test('goes through only for a real payment of exactly the order total', async () => {
    const b = s.browser();
    await b.signIn();
    assert.equal((await b.call('POST', '/orders', delivery())).status, 402); // no payment at all
    assert.equal((await b.call('POST', '/orders', delivery({ paymentId: 'pi_low' }))).status, 402); // paid too little
    assert.equal((await b.call('POST', '/orders', delivery({ paymentId: 'pi_open' }))).status, 402); // not paid yet
    const ok = await b.call('POST', '/orders', delivery({ paymentId: 'pi_ok', paidWith: 'Apple Pay' }));
    assert.equal(ok.status, 201);
    assert.equal(ok.body.order.paidWith, 'Stripe (test mode)');
  });

  test('a payment can only pay for one order', async () => {
    const b = s.browser();
    await b.signIn();
    const again = await b.call('POST', '/orders', delivery({ paymentId: 'pi_ok' }));
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'This payment was already used for an order.');
  });
});

describe('sandbox mode (browser tests only)', () => {
  test('gives every browser its own accounts and order numbers', async () => {
    const s = await startServer({ sandbox: true });
    const one = s.browser(), two = s.browser();
    for (const b of [one, two]) { await b.call('GET', '/session'); await b.signIn(); }
    assert.equal((await one.call('POST', '/orders', delivery())).body.order.id, 'FM-1001');
    assert.equal((await two.call('POST', '/orders', delivery())).body.order.id, 'FM-1001');
    assert.equal((await two.call('GET', '/session')).body.orders.length, 1);
    await s.close();
  });
});
