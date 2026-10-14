// Unit tests for the payment server code. Run with: npm run test:api
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { priceOrder, PricingError } = require('../api/_pricing');
const createIntent = require('../api/create-payment-intent');
const config = require('../api/config');
const PRICES = require('../data/prices.json');

const id = (name) => PRICES.find((p) => p.name === name).id;
const OIL = id('Extra Virgin Olive Oil'); // 13.99
const SOURDOUGH = id('Sourdough Loaf'); // 5.49
const CHICKEN = id('Chicken Breasts'); // 7.99 per lb

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}
function fakeStripe() {
  const calls = [];
  return {
    calls,
    paymentIntents: {
      create: async (args) => (calls.push(args), { id: 'pi_test_123', client_secret: 'pi_test_123_secret_abc' }),
    },
  };
}

describe('priceOrder', () => {
  test('delivery under $50 adds the $4.99 fee and estimated HST', () => {
    const r = priceOrder({ mode: 'delivery', items: [{ id: OIL, q: 3 }] });
    assert.equal(r.subtotal, 41.97);
    assert.equal(r.hst, 1.36);
    assert.equal(r.fee, 4.99);
    assert.equal(r.total, 48.32);
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
    for (const p of PRICES) {
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
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  });

  test('creates a CAD PaymentIntent for the server-calculated amount', async () => {
    const stripe = fakeStripe(), res = mockRes();
    await createIntent.handler({ method: 'POST', body: { mode: 'delivery', items: [{ id: OIL, q: 3 }] } }, res, stripe);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { clientSecret: 'pi_test_123_secret_abc', amountCents: 4832, total: 48.32, captureMethod: 'automatic' });
    assert.equal(stripe.calls.length, 1);
    assert.equal(stripe.calls[0].amount, 4832);
    assert.equal(stripe.calls[0].currency, 'cad');
    assert.equal(stripe.calls[0].capture_method, 'automatic');
    assert.deepEqual(stripe.calls[0].automatic_payment_methods, { enabled: true });
  });

  test('uses manual capture for weighted orders', async () => {
    const stripe = fakeStripe(), res = mockRes();
    await createIntent.handler({ method: 'POST', body: { mode: 'pickup', items: [{ id: CHICKEN, q: 2 }] } }, res, stripe);
    assert.equal(res.statusCode, 200);
    assert.equal(stripe.calls[0].capture_method, 'manual');
  });

  test('accepts a JSON string body', async () => {
    const stripe = fakeStripe(), res = mockRes();
    await createIntent.handler({ method: 'POST', body: JSON.stringify({ mode: 'pickup', items: [{ id: OIL, q: 1 }] }) }, res, stripe);
    assert.equal(res.statusCode, 200);
  });

  test('rejects an invalid order without calling Stripe', async () => {
    const stripe = fakeStripe(), res = mockRes();
    await createIntent.handler({ method: 'POST', body: { mode: 'delivery', items: [{ id: SOURDOUGH, q: 1 }] } }, res, stripe);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Delivery needs a minimum order of $35.00.');
    assert.equal(stripe.calls.length, 0);
  });

  test('rejects unreadable JSON', async () => {
    const res = mockRes();
    await createIntent.handler({ method: 'POST', body: '{not json' }, res, fakeStripe());
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'The order could not be read.');
  });

  test('only accepts POST', async () => {
    const res = mockRes();
    await createIntent.handler({ method: 'GET' }, res, fakeStripe());
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, 'POST');
  });

  test('returns 503 when Stripe is not set up', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = mockRes();
    await createIntent.handler({ method: 'POST', body: { mode: 'pickup', items: [{ id: OIL, q: 1 }] } }, res, fakeStripe());
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'Online payments are not set up yet.');
  });

  test('hides Stripe errors from the browser', async () => {
    const res = mockRes();
    const broken = { paymentIntents: { create: async () => { throw new Error('Invalid API Key provided: sk_test_***'); } } };
    const orig = console.error; console.error = () => {};
    await createIntent.handler({ method: 'POST', body: { mode: 'pickup', items: [{ id: OIL, q: 1 }] } }, res, broken);
    console.error = orig;
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'The payment service is not responding. Try again in a moment.');
    assert.ok(!JSON.stringify(res.body).includes('sk_test'));
  });
});

describe('GET /api/config', () => {
  test('reports Stripe off when keys are missing', () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY; delete process.env.STRIPE_SECRET_KEY;
    const res = mockRes(); config({}, res);
    assert.deepEqual(res.body, { stripe: false });
  });

  test('shares only the publishable key, never the secret key', () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_abc'; process.env.STRIPE_SECRET_KEY = 'sk_test_secret';
    const res = mockRes(); config({}, res);
    assert.deepEqual(res.body, { stripe: true, publishableKey: 'pk_test_abc', testMode: true });
    assert.ok(!JSON.stringify(res.body).includes('sk_test'));
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  test('stays off if only the publishable key is set', () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_abc'; delete process.env.STRIPE_SECRET_KEY;
    const res = mockRes(); config({}, res);
    assert.deepEqual(res.body, { stripe: false });
  });
});
