// GET /api/config
// Tells the checkout whether real Stripe payments are switched on.
// The publishable key is safe to share with the browser; the secret key never leaves the server.
module.exports = function handler(req, res) {
  const key = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const ready = key.startsWith('pk_') && !!process.env.STRIPE_SECRET_KEY;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(ready ? { stripe: true, publishableKey: key, testMode: key.startsWith('pk_test_') } : { stripe: false });
};
