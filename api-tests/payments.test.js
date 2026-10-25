// Unit tests for pricing and the payment endpoints. Run with: npm run test:api
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { priceOrder, PricingError } = require('../server/pricing');
const { PRODUCTS } = require('../server/catalog');
const { startServer, fakeStripe, PK, SK } = require('./helpers');

const id = (name) => PRODUCTS.find((p) => p.name === name).id;
const OIL = id('Extra Virgin Olive Oil'); // 13.99
const SOURDOUGH = id('Sourdough Loaf'); // 5.49
const CHICKEN = id('Chicken Breasts'); // 7.99 per lb

describe('priceOrder', () => {
  test('delivery under $50 adds the $4.99 fee and estimated HST', () => {
    const r = priceOrder({ mode: 'delivery', items: [{ id: OIL, q: 3 }] });
    assert.equal(r.subtotal, 41.97);
    assert.equal(r.hst, 1.36);
    assert.equal(r.fee, 4.99);
    assert.equal(r.total, 48.32);
    assert.equal(r.saved, 6);
    assert.equal(r.amountCents, 4832);
    assert.equal(r.captureMethod, 'automatic');
  });

  test('delivery is free at $50 or more', () => {
    const r = priceOrder({ mode: 'delivery', items: [{ id: OIL, q: 4 }] });
    assert.equal(r.subtotal, 55.96);
    assert.equal(r.fee, 0);
  });

  test('pickup has no fee and no minimum', () => {
    const r = priceOrder({ mode: 'pickup', items: [{ id: SOURDOUGH, q: 1 }] });
    assert.equal(r.fee, 0);
    assert.equal(r.total, 5.67);
    assert.equal(r.amountCents, 567);
  });

  test('delivery under the $35 minimum is refused', () => {
    assert.throws(() => priceOrder({ mode: 'delivery', items: [{ id: SOURDOUGH, q: 1 }] }), {
      name: 'Error',
      message: 'Delivery needs a minimum order of $35.00.',
    });
  });

  test('weighted items are authorized at 110% and captured later', () => {
    const r = priceOrder({ mode: 'delivery', items: [{ id: OIL, q: 3 }, { id: CHICKEN, q: 1 }] });
    assert.equal(r.total, 56.57);
    assert.equal(r.weighted, true);
    assert.equal(r.amountCents, 6223);
    assert.equal(r.captureMethod, 'manual');
  });

  test('matches the checkout page for every product (no rounding drift)', () => {
    for (const p of PRODUCTS) {
      for (const q of [1, 2, 3, 7]) {
        const r = priceOrder({ mode: 'pickup', items: [{ id: p.id, q }] });
        const sub = p.price * q, total = sub + sub * 0.13 * 0.25;
        const expected = Math.round((p.per ? Math.round(total * 1.1 * 100) / 100 : Math.round(total * 100) / 100) * 100);
        assert.equal(r.amountCents, expected, `${p.name} × ${q}`);
      }
    }
  });

  for (const [label, order, message] of [
    ['empty cart', { mode: 'pickup', items: [] }, 'Your cart is empty.'],
    ['missing mode', { items: [{ id: OIL, q: 1 }] }, 'Choose delivery or pickup.'],
    ['unknown product', { mode: 'pickup', items: [{ id: 9999, q: 1 }] }, 'Unknown product 9999.'],
    ['zero quantity', { mode: 'pickup', items: [{ id: OIL, q: 0 }] }, 'Invalid quantity for Extra Virgin Olive Oil.'],
    ['fractional quantity', { mode: 'pickup', items: [{ id: OIL, q: 1.5 }] }, 'Invalid quantity for Extra Virgin Olive Oil.'],
    ['huge quantity', { mode: 'pickup', items: [{ id: OIL, q: 1000 }] }, 'Invalid quantity for Extra Virgin Olive Oil.'],
  ]) {
    test(`rejects ${label}`, () => {
      assert.throws(() => priceOrder(order), (e) => e instanceof PricingError && e.message === message);
    });
  }

  test('ignores any price the browser sends', () => {
    const r = priceOrder({ mode: 'pickup', items: [{ id: OIL, q: 1, price: 0.01 }], total: 0.01 });
    assert.equal(r.subtotal, 13.99);
  });
});

describe('POST /api/create-payment-intent', () => {
  let srv, b;
  before(async () => { srv = await startServer({ env: { STRIPE_SECRET_KEY: SK, STRIPE_PUBLISHABLE_KEY: PK } }); b = srv.browser(); });
  after(() => srv.close());

  test('creates a CAD PaymentIntent for the server-calculated amount', async () => {
    srv.stripe.calls.length = 0;
    const r = await b.call('POST', '/create-payment-intent', { mode: 'delivery', items: [{ id: OIL, q: 3 }] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { clientSecret: 'pi_test_123_secret_abc', amountCents: 4832, total: 48.32, captureMethod: 'automatic' });
    assert.equal(srv.stripe.calls.length, 1);
    assert.equal(srv.stripe.calls[0].amount, 4832);
    assert.equal(srv.stripe.calls[0].currency, 'cad');
    assert.equal(srv.stripe.calls[0].capture_method, 'automatic');
    assert.deepEqual(srv.stripe.calls[0].automatic_payment_methods, { enabled: true });
  });

  test('uses manual capture for weighted orders', async () => {
    srv.stripe.calls.length = 0;
    const r = await b.call('POST', '/create-payment-intent', { mode: 'pickup', items: [{ id: CHICKEN, q: 2 }] });
    assert.equal(r.status, 200);
    assert.equal(srv.stripe.calls[0].capture_method, 'manual');
  });

  test('rejects an invalid order without calling Stripe', async () => {
    srv.stripe.calls.length = 0;
    const r = await b.call('POST', '/create-payment-intent', { mode: 'delivery', items: [{ id: SOURDOUGH, q: 1 }] });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'Delivery needs a minimum order of $35.00.');
    assert.equal(srv.stripe.calls.length, 0);
  });

  test('rejects unreadable JSON', async () => {
    const r = await b.call('POST', '/create-payment-intent', null, { raw: '{not json' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'The order could not be read.');
  });

  test('only accepts POST', async () => {
    const r = await b.call('GET', '/create-payment-intent');
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'POST');
  });

  test('hides Stripe errors from the browser', async () => {
    const broken = { paymentIntents: { create: async () => { throw new Error('Invalid API Key provided: sk_test_***'); } } };
    const s2 = await startServer({ env: { STRIPE_SECRET_KEY: SK }, stripe: broken });
    const orig = console.error; console.error = () => {};
    const r = await s2.browser().call('POST', '/create-payment-intent', { mode: 'pickup', items: [{ id: OIL, q: 1 }] });
    console.error = orig;
    await s2.close();
    assert.equal(r.status, 502);
    assert.equal(r.body.error, 'The payment service is not responding. Try again in a moment.');
    assert.ok(!JSON.stringify(r.body).includes('sk_test'));
  });

  test('returns 503 when Stripe is not set up', async () => {
    const s2 = await startServer({ env: {}, stripe: fakeStripe() });
    const r = await s2.browser().call('POST', '/create-payment-intent', { mode: 'pickup', items: [{ id: OIL, q: 1 }] });
    await s2.close();
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'Online payments are not set up yet.');
  });
});

describe('GET /api/config', () => {
  let srv;
  before(async () => { srv = await startServer({ env: {} }); });
  after(() => srv.close());
  const run = async (keys) => {
    for (const k of ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY']) delete srv.env[k];
    Object.assign(srv.env, keys);
    return srv.browser().call('GET', '/config');
  };

  test('reports Stripe off when keys are missing', async () => {
    assert.deepEqual((await run({})).body, { stripe: false });
  });

  test('shares only the publishable key, never the secret key', async () => {
    const r = await run({ STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: SK });
    assert.deepEqual(r.body, { stripe: true, publishableKey: PK, testMode: true });
    assert.ok(!JSON.stringify(r.body).includes('sk_test'));
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  test('ignores spaces around pasted keys', async () => {
    assert.equal((await run({ STRIPE_PUBLISHABLE_KEY: `  ${PK}\n`, STRIPE_SECRET_KEY: ` ${SK} ` })).body.publishableKey, PK);
  });

  test('stays off if only the publishable key is set', async () => {
    const { body } = await run({ STRIPE_PUBLISHABLE_KEY: PK });
    assert.equal(body.stripe, false);
    assert.match(body.setupProblem, /STRIPE_SECRET_KEY is not a full Stripe secret key/);
  });

  test('rejects the shortened key text copied from the dashboard', async () => {
    const { body } = await run({ STRIPE_PUBLISHABLE_KEY: 'pk_test_...JD7i', STRIPE_SECRET_KEY: 'sk_test_...JN0I' });
    assert.equal(body.stripe, false);
    assert.match(body.setupProblem, /STRIPE_PUBLISHABLE_KEY is not a full Stripe publishable key/);
    assert.ok(!('publishableKey' in body));
  });

  test('rejects a shortened secret key even when the publishable key is fine', async () => {
    assert.match((await run({ STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: 'sk_test_…JN0I' })).body.setupProblem, /STRIPE_SECRET_KEY/);
  });

  test('rejects mixing test and live keys', async () => {
    assert.match((await run({ STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: SK.replace('sk_test_', 'sk_live_') })).body.setupProblem, /different modes/);
  });

  test('accepts a restricted secret key', async () => {
    assert.equal((await run({ STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: SK.replace('sk_', 'rk_') })).body.stripe, true);
  });
});
