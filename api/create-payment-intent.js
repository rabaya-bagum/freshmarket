// POST /api/create-payment-intent
// Body: { items: [{ id, q }], mode: 'delivery' | 'pickup', orderRef?: string }
// Prices the order on the server and creates a Stripe PaymentIntent for that amount.
const { priceOrder, PricingError } = require('./_pricing');

let stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

async function handler(req, res, stripe = null) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Online payments are not set up yet.' });
  }

  let priced;
  let orderRef;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    priced = priceOrder(body);
    orderRef = typeof body.orderRef === 'string' ? body.orderRef.slice(0, 40) : undefined;
  } catch (e) {
    const msg = e instanceof PricingError ? e.message : 'The order could not be read.';
    return res.status(400).json({ error: msg });
  }

  try {
    const intent = await (stripe || getStripe()).paymentIntents.create({
      amount: priced.amountCents,
      currency: 'cad',
      capture_method: priced.captureMethod,
      automatic_payment_methods: { enabled: true },
      metadata: { orderRef: orderRef || '', subtotal: String(priced.subtotal), total: String(priced.total), weighted: String(priced.weighted) },
    });
    return res.status(200).json({
      clientSecret: intent.client_secret,
      amountCents: priced.amountCents,
      total: priced.total,
      captureMethod: priced.captureMethod,
    });
  } catch (e) {
    // Never pass Stripe's raw error to the browser
    console.error('Stripe error', e && e.message);
    return res.status(502).json({ error: 'The payment service is not responding. Try again in a moment.' });
  }
}

module.exports = (req, res) => handler(req, res);
module.exports.handler = handler;
