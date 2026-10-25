// The FreshMarket server: products, accounts, carts, orders and payments, all under /api.
// createApp() only builds the Express app. server/index.js serves it locally; api/index.js runs it on Vercel.
const crypto = require('node:crypto');
const express = require('express');
const { loadCatalog } = require('./catalog');
const { priceOrder, PricingError } = require('./pricing');
const { hashPassword, checkPassword, sessions, parseCookies } = require('./security');

const STATUS = { delivery: ['Placed', 'Picking', 'Out for delivery', 'Completed'], pickup: ['Placed', 'Picking', 'Ready for pickup', 'Completed'] };
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const DEMO = { email: 'demo@freshmarket.ca', password: 'Fresh123', name: 'Demo Shopper' };
const GOOGLE_DEMO = { email: 'shopper@gmail.com', name: 'Google Shopper' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
const PAID_WITH = /^(card ending in \d{4}|Apple Pay|Google Pay|Stripe|Stripe \(test mode\))$/;

// ---- Stripe keys (GET /api/config). Real keys are long (around 100 characters). A short value like
// "pk_test_...JD7i" is the shortened text the Stripe dashboard shows on screen, not the key itself.
const PK = /^pk_(test|live)_[A-Za-z0-9]{24,}$/;
const SK = /^(sk|rk)_(test|live)_[A-Za-z0-9]{24,}$/;

function keyProblem(pk, sk) {
  if (!pk && !sk) return null; // not set up yet: plain demo mode
  if (!PK.test(pk)) return 'STRIPE_PUBLISHABLE_KEY is not a full Stripe publishable key. Copy the whole key (it starts with pk_ and is about 100 characters), not the shortened text shown on the Stripe dashboard.';
  if (!SK.test(sk)) return 'STRIPE_SECRET_KEY is not a full Stripe secret key. Copy the whole key (it starts with sk_ and is about 100 characters), not the shortened text shown on the Stripe dashboard.';
  if (pk.split('_')[1] !== sk.split('_')[1]) return 'The publishable and secret keys are from different modes. Use both test keys or both live keys.';
  return null;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {object} opts
 * @param {{query: Function}} opts.db
 * @param {object} [opts.stripe] Stripe client (tests pass a fake)
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {boolean} [opts.sandbox] give every browser its own private data (browser tests only)
 */
function createApp({ db, stripe = null, env = process.env, sandbox = false }) {
  const secret = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  if (!env.SESSION_SECRET && env.NODE_ENV === 'production') console.warn('FreshMarket: SESSION_SECRET is not set, so sign-ins end whenever the server restarts.');
  const session = sessions(secret);
  const secure = env.NODE_ENV === 'production';
  const stripeKeys = () => ({ pk: (env.STRIPE_PUBLISHABLE_KEY || '').trim(), sk: (env.STRIPE_SECRET_KEY || '').trim() });
  const stripeOn = () => { const { pk, sk } = stripeKeys(); return Boolean(pk && sk && !keyProblem(pk, sk)); };
  const getStripe = () => (stripe ||= new (require('stripe'))(stripeKeys().sk));

  // The demo account exists in every data space; its hash is worked out once
  let demoHash = null;
  const seeded = new Set();
  async function seed(ns) {
    if (seeded.has(ns)) return;
    demoHash ||= await hashPassword(DEMO.password);
    await db.query('INSERT INTO users (ns, email, name, pw_hash, verified) VALUES ($1, $2, $3, $4, true) ON CONFLICT (ns, email) DO NOTHING', [ns, DEMO.email, DEMO.name, demoHash]);
    seeded.add(ns);
  }

  const app = express();
  app.disable('x-powered-by');
  const api = express.Router();

  // ---- who is asking: data space (one shared space, or one per browser in sandbox mode) and signed-in user
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    req.ns = 'live';
    if (sandbox) {
      let id = req.cookies.fm_sandbox;
      if (!/^[a-f0-9]{32}$/.test(id || '')) {
        id = crypto.randomBytes(16).toString('hex');
        res.cookie('fm_sandbox', id, { httpOnly: true, sameSite: 'lax', path: '/' });
      }
      req.ns = 'sandbox-' + id;
    }
    next();
  });
  app.use('/api', api);

  api.use(express.json({ limit: '20kb' }));
  // Changes must come as JSON. A plain cross-site form can't send that, which blocks forged requests.
  api.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'Send the request as JSON.' });
    if (!req.body || typeof req.body !== 'object') req.body = {};
    next();
  });

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const only = (...methods) => (req, res) => { res.setHeader('Allow', methods.join(', ')); res.status(405).json({ error: `Use ${methods.join(' or ')}.` }); };

  async function currentUser(req) {
    const id = session.read(req.cookies.fm_session);
    if (!id) return null;
    const { rows } = await db.query('SELECT id, email, name FROM users WHERE id = $1 AND ns = $2', [id, req.ns]);
    return rows[0] || null;
  }
  async function needUser(req) {
    const u = await currentUser(req);
    if (!u) throw new HttpError(401, 'Sign in to continue.');
    return u;
  }
  function startSession(res, userId) {
    res.cookie('fm_session', session.create(userId), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 864e5 });
  }

  // ---- the catalog (products, stores, stock) is read from the database for each request that needs it
  const catalog = () => loadCatalog(db);

  // ---- cart: { [productId]: quantity }
  function cleanCart(items, byId) {
    const out = {};
    if (!items || typeof items !== 'object' || Array.isArray(items)) return out;
    for (const [id, q] of Object.entries(items)) if (byId.has(Number(id)) && Number.isInteger(q) && q > 0) out[Number(id)] = Math.min(q, 99);
    return out;
  }
  async function loadCart(userId, byId) {
    const { rows } = await db.query('SELECT items FROM carts WHERE user_id = $1', [userId]);
    return cleanCart(rows[0]?.items, byId);
  }
  async function saveCart(userId, items) {
    await db.query(
      `INSERT INTO carts (user_id, items, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET items = EXCLUDED.items, updated_at = now()`,
      [userId, JSON.stringify(items)]
    );
  }

  // ---- orders, in the shape the store page shows
  const orderOut = (row) => ({ ...row.details, id: row.number, status: row.status, created: new Date(row.created_at).toISOString(), paymentId: row.payment_id });
  async function loadOrders(userId) {
    const { rows } = await db.query('SELECT number, status, details, payment_id, created_at FROM orders WHERE user_id = $1 ORDER BY id DESC', [userId]);
    return rows.map(orderOut);
  }
  async function signedIn(res, user, guestCart) {
    // Anything added before signing in joins the saved cart (the larger quantity wins)
    const { byId } = await catalog();
    const cart = await loadCart(user.id, byId);
    for (const [id, q] of Object.entries(cleanCart(guestCart, byId))) cart[id] = Math.max(cart[id] || 0, q);
    await saveCart(user.id, cart);
    startSession(res, user.id);
    res.json({ user: { name: user.name, email: user.email }, cart, orders: await loadOrders(user.id) });
  }

  // ---- catalog
  const positiveInt = (value, fallback) => {
    if (value === undefined) return fallback;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  api.route('/products').get(wrap(async (req, res) => {
    const page = positiveInt(req.query.page, 1), perPage = positiveInt(req.query.per_page, 10);
    if (page === null || perPage === null || perPage > 50) return res.status(400).json({ error: 'page must be a positive whole number and per_page between 1 and 50.' });
    const { products } = await catalog();
    res.setHeader('Cache-Control', 'public, max-age=60');
    const start = (page - 1) * perPage;
    res.json({ page, per_page: perPage, total: products.length, total_pages: Math.ceil(products.length / perPage), data: products.slice(start, start + perPage) });
  })).all(only('GET'));

  api.route('/products/:id').get(wrap(async (req, res) => {
    const raw = req.params.id, id = Number(raw);
    // An id that is not a whole number (e.g. /api/products/a) is answered with a server error.
    if (!/^\d+$/.test(raw) || !Number.isInteger(id)) return res.status(500).json({ error: 'Server error: product id must be a whole number.' });
    const p = (await catalog()).byId.get(id);
    if (!p) return res.status(404).json({ error: `Product ${id} not found.` });
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ data: p });
  })).all(only('GET'));

  api.route('/stores').get(wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ data: (await catalog()).stores });
  })).all(only('GET'));

  // ---- payments
  api.route('/config').get((req, res) => {
    const { pk, sk } = stripeKeys();
    res.setHeader('Cache-Control', 'no-store');
    const problem = keyProblem(pk, sk);
    if (problem) return res.json({ stripe: false, setupProblem: problem });
    if (!pk || !sk) return res.json({ stripe: false });
    res.json({ stripe: true, publishableKey: pk, testMode: pk.startsWith('pk_test_') });
  }).all(only('GET'));

  api.route('/create-payment-intent').post(wrap(async (req, res) => {
    if (!stripeKeys().sk) return res.status(503).json({ error: 'Online payments are not set up yet.' });
    const { byId } = await catalog();
    let priced;
    try {
      priced = priceOrder(req.body, byId);
    } catch (e) {
      return res.status(400).json({ error: e instanceof PricingError ? e.message : 'The order could not be read.' });
    }
    const orderRef = typeof req.body.orderRef === 'string' ? req.body.orderRef.slice(0, 40) : '';
    try {
      const intent = await getStripe().paymentIntents.create({
        amount: priced.amountCents,
        currency: 'cad',
        capture_method: priced.captureMethod,
        automatic_payment_methods: { enabled: true },
        metadata: { orderRef, subtotal: String(priced.subtotal), total: String(priced.total), weighted: String(priced.weighted) },
      });
      res.json({ clientSecret: intent.client_secret, amountCents: priced.amountCents, total: priced.total, captureMethod: priced.captureMethod });
    } catch (e) {
      // Never pass Stripe's raw error to the browser
      console.error('Stripe error', e && e.message);
      res.status(502).json({ error: 'The payment service is not responding. Try again in a moment.' });
    }
  })).all(only('POST'));

  // ---- accounts
  api.get('/session', wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const u = await currentUser(req);
    if (!u) return res.json({ user: null });
    res.json({ user: { name: u.name, email: u.email }, cart: await loadCart(u.id, (await catalog()).byId), orders: await loadOrders(u.id) });
  }));

  api.post('/auth/signin', wrap(async (req, res) => {
    await seed(req.ns);
    const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
    // GP-81: never look up an account unless both fields are filled in and the email looks valid
    if (!email) throw new HttpError(400, 'Enter your email address.');
    if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address, like name@example.com.');
    if (!password) throw new HttpError(400, 'Enter your password.');

    const { rows } = await db.query('SELECT * FROM users WHERE ns = $1 AND email = $2', [req.ns, email]);
    const u = rows[0];
    const lockedNow = u && u.fails >= MAX_FAILS && new Date(u.last_failed_at) > new Date(Date.now() - LOCK_MINUTES * 60e3);
    if (u && u.fails >= MAX_FAILS && !lockedNow) u.fails = 0; // the lock wears off after LOCK_MINUTES
    if (lockedNow) throw new HttpError(423, 'This account is locked after 5 failed attempts. Reset your password to unlock it.');

    const ok = await checkPassword(password, u && u.pw_hash);
    if (!u || !ok) {
      let msg = "That email and password don't match.";
      if (u) {
        const fails = u.fails + 1;
        await db.query('UPDATE users SET fails = $1, last_failed_at = now() WHERE id = $2', [fails, u.id]);
        const left = MAX_FAILS - fails;
        if (left > 0) msg += ` ${left} attempt${left === 1 ? '' : 's'} left before the account locks.`;
      }
      throw new HttpError(401, msg);
    }
    if (!u.verified) {
      // Demo: the first sign-in stands in for clicking the link in the verification email
      await db.query('UPDATE users SET verified = true WHERE id = $1', [u.id]);
      throw new HttpError(403, `Verify your email first. We sent a link to ${email}.`);
    }
    await db.query('UPDATE users SET fails = 0 WHERE id = $1', [u.id]);
    await signedIn(res, u, req.body.cart);
  }));

  api.post('/auth/signup', wrap(async (req, res) => {
    await seed(req.ns);
    const name = String(req.body.name || '').trim().slice(0, 80), email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
    if (!name) throw new HttpError(400, 'Enter your full name.');
    if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address, like name@example.com.');
    if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
    if (!/\d/.test(password)) throw new HttpError(400, 'Add at least one number to your password.');
    const { rows } = await db.query(
      'INSERT INTO users (ns, email, name, pw_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (ns, email) DO NOTHING RETURNING id',
      [req.ns, email, name, await hashPassword(password)]
    );
    if (!rows.length) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
    res.status(201).json({ ok: true });
  }));

  api.post('/auth/reset', wrap(async (req, res) => {
    await seed(req.ns);
    const email = String(req.body.email || '').trim().toLowerCase();
    // Demo: no email is sent, but the lock is lifted. The reply is the same whether or not the account exists.
    await db.query('UPDATE users SET fails = 0 WHERE ns = $1 AND email = $2', [req.ns, email]);
    res.json({ ok: true });
  }));

  api.post('/auth/google', wrap(async (req, res) => {
    // Demo stand-in for Google sign-in: always the same sample shopper
    const { rows } = await db.query(
      `INSERT INTO users (ns, email, name, pw_hash, verified) VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (ns, email) DO UPDATE SET verified = true RETURNING id, email, name`,
      [req.ns, GOOGLE_DEMO.email, GOOGLE_DEMO.name, await hashPassword(crypto.randomBytes(24).toString('hex'))]
    );
    await signedIn(res, rows[0], req.body.cart);
  }));

  api.post('/auth/signout', (req, res) => {
    res.clearCookie('fm_session', { httpOnly: true, sameSite: 'lax', secure, path: '/' });
    res.json({ ok: true });
  });

  api.put('/cart', wrap(async (req, res) => {
    const u = await needUser(req);
    const cart = cleanCart(req.body.items, (await catalog()).byId);
    await saveCart(u.id, cart);
    res.json({ cart });
  }));

  // ---- orders
  api.post('/orders', wrap(async (req, res) => {
    const u = await needUser(req);
    const b = req.body;
    const { stores, byId } = await catalog();
    const store = stores.find((s) => s.id === b.store);
    if (!Number.isInteger(b.store) || !store) throw new HttpError(400, 'Choose a store.');
    let priced;
    try {
      priced = priceOrder({ mode: b.mode, items: b.items }, byId);
    } catch (e) {
      throw new HttpError(400, e instanceof PricingError ? e.message : 'The order could not be read.');
    }
    const storeIndex = stores.indexOf(store);
    for (const { p, q } of priced.lines) {
      const left = p.stock[storeIndex];
      if (q > left) throw new HttpError(409, left ? `Only ${left} of ${p.name} left at ${store.name}.` : `${p.name} is out of stock at ${store.name}.`);
    }
    const when = String(b.when || '').trim();
    if (!when || when.length > 80) throw new HttpError(400, 'Choose a delivery or pickup time.');

    let where;
    if (b.mode === 'delivery') {
      const street = String(b.street || '').trim().slice(0, 120), postal = String(b.postal || '').toUpperCase().replace(/\s+/g, '');
      if (!street) throw new HttpError(400, 'Enter your street address.');
      if (!POSTAL.test(postal)) throw new HttpError(400, 'Enter a postal code like L5B 2C9.');
      if (!store.areas.includes(postal.slice(0, 3))) throw new HttpError(400, `We don't deliver to ${postal.slice(0, 3)} ${postal.slice(3)} from ${store.name} yet.`);
      where = `${street}, ${postal.slice(0, 3)} ${postal.slice(3)}`;
    } else {
      where = `FreshMarket ${store.name}, ${store.addr}`;
    }

    // With Stripe switched on, the order only goes through for a real payment of exactly this amount
    let paidWith, paymentId = null;
    if (stripeOn()) {
      paymentId = typeof b.paymentId === 'string' ? b.paymentId : '';
      if (!/^pi_[A-Za-z0-9_]+$/.test(paymentId)) throw new HttpError(402, 'Your payment was not approved. Try another payment method.');
      let pi;
      try {
        pi = await getStripe().paymentIntents.retrieve(paymentId);
      } catch (e) {
        console.error('Stripe error', e && e.message);
        throw new HttpError(502, 'The payment service is not responding. Try again in a moment.');
      }
      if (!['succeeded', 'requires_capture', 'processing'].includes(pi.status) || pi.amount !== priced.amountCents || pi.currency !== 'cad') {
        throw new HttpError(402, 'Your payment was not approved. Try another payment method.');
      }
      paidWith = stripeKeys().pk.startsWith('pk_test_') ? 'Stripe (test mode)' : 'Stripe';
    } else {
      // Demo mode: nothing is charged, so the page's description of the payment is kept as is
      paidWith = String(b.paidWith || '');
      if (!PAID_WITH.test(paidWith)) throw new HttpError(400, 'Choose a payment method.');
    }

    const { rows: [seq] } = await db.query(
      'INSERT INTO order_numbers (ns, next) VALUES ($1, 1001) ON CONFLICT (ns) DO UPDATE SET next = order_numbers.next + 1 RETURNING next',
      [req.ns]
    );
    const details = {
      email: u.email,
      mode: b.mode,
      when,
      where,
      items: priced.lines.map(({ p, q }) => ({ id: p.id, name: p.name, emoji: p.emoji, q, price: p.price })),
      sub: priced.subtotal,
      saved: priced.saved,
      hst: priced.hst,
      fee: priced.fee,
      total: priced.total,
      paidWith,
    };
    let row;
    try {
      ({ rows: [row] } = await db.query(
        'INSERT INTO orders (user_id, number, details, payment_id) VALUES ($1, $2, $3, $4) RETURNING number, status, details, payment_id, created_at',
        [u.id, 'FM-' + seq.next, JSON.stringify(details), paymentId]
      ));
    } catch (e) {
      if (paymentId && /duplicate|unique/i.test(e.message)) throw new HttpError(409, 'This payment was already used for an order.');
      throw e;
    }
    await saveCart(u.id, {});
    res.status(201).json({ order: orderOut(row) });
  }));

  api.post('/orders/:number/advance', wrap(async (req, res) => {
    // Demo control: moves an order one step along, as the store would while picking and delivering
    const u = await needUser(req);
    const { rows } = await db.query(
      `UPDATE orders SET status = LEAST(status + 1, 3) WHERE user_id = $1 AND number = $2
       RETURNING number, status, details, payment_id, created_at`,
      [u.id, req.params.number]
    );
    if (!rows.length) throw new HttpError(404, 'Order not found.');
    const order = orderOut(rows[0]);
    res.json({ order, statusName: STATUS[order.mode][order.status] });
  }));

  // ---- learning aid, on your own computer only: a real bug on purpose, to see a 500 and its stack trace
  if (!secure) {
    api.get('/debug/crash', () => {
      const order = undefined;
      return order.total; // TypeError: Cannot read properties of undefined (reading 'total')
    });
  }

  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  // Express treats a handler with four arguments as the error handler, so `next` must stay
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  api.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'The order could not be read.' });
    console.error(err);
    const body = { error: 'Something went wrong on our side. Try again in a moment.' };
    // On your own computer the answer also carries the error and where it happened. Never on the live
    // site (NODE_ENV=production): a stack trace shows file paths and code to anyone who asks.
    if (!secure) Object.assign(body, { type: err.name, message: err.message, stack: String(err.stack || '').split('\n').map((line) => line.trim()) });
    res.status(500).json(body);
  });

  return app;
}

module.exports = { createApp };
