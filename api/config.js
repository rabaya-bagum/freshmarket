// GET /api/config
// Tells the checkout whether real Stripe payments are switched on.
// The publishable key is safe to share with the browser; the secret key never leaves the server.
// Real Stripe keys are long (around 100 characters). A short value like "pk_test_...JD7i" is the
// shortened text the Stripe dashboard shows on screen, not the key itself.
const PK = /^pk_(test|live)_[A-Za-z0-9]{24,}$/;
const SK = /^(sk|rk)_(test|live)_[A-Za-z0-9]{24,}$/;

function keyProblem(pk, sk) {
  if (!pk && !sk) return null; // not set up yet: plain demo mode
  if (!PK.test(pk)) return 'STRIPE_PUBLISHABLE_KEY is not a full Stripe publishable key. Copy the whole key (it starts with pk_ and is about 100 characters), not the shortened text shown on the Stripe dashboard.';
  if (!SK.test(sk)) return 'STRIPE_SECRET_KEY is not a full Stripe secret key. Copy the whole key (it starts with sk_ and is about 100 characters), not the shortened text shown on the Stripe dashboard.';
  if (pk.split('_')[1] !== sk.split('_')[1]) return 'The publishable and secret keys are from different modes. Use both test keys or both live keys.';
  return null;
}

function handler(req, res) {
  const pk = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
  const sk = (process.env.STRIPE_SECRET_KEY || '').trim();
  res.setHeader('Cache-Control', 'no-store');
  const problem = keyProblem(pk, sk);
  if (problem) return res.status(200).json({ stripe: false, setupProblem: problem });
  if (!pk || !sk) return res.status(200).json({ stripe: false });
  return res.status(200).json({ stripe: true, publishableKey: pk, testMode: pk.startsWith('pk_test_') });
}

module.exports = handler;
module.exports.keyProblem = keyProblem;
