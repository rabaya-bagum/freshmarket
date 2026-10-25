// Starts the real server on a free port with a fresh in-memory database, for the API tests.
const { openDb } = require('../server/db');
const { createApp } = require('../server/app');

const PK = 'pk_test_' + 'A1b2C3d4'.repeat(12); // full-length test keys
const SK = 'sk_test_' + 'Z9y8X7w6'.repeat(12);

/** A stand-in for the Stripe client that records what the server asks for. */
function fakeStripe({ intents = {} } = {}) {
  const calls = [];
  return {
    calls,
    intents,
    paymentIntents: {
      create: async (args) => (calls.push(args), { id: 'pi_test_123', client_secret: 'pi_test_123_secret_abc' }),
      retrieve: async (id) => {
        if (!intents[id]) throw new Error('No such payment_intent');
        return { id, currency: 'cad', ...intents[id] };
      },
    },
  };
}

async function startServer({ env = {}, stripe = fakeStripe(), sandbox = false } = {}) {
  const db = await openDb({ url: '' });
  const server = createApp({ db, stripe, env, sandbox }).listen(0);
  await new Promise((ok) => server.once('listening', ok));
  const base = `http://localhost:${server.address().port}/api`;

  /** A browser: keeps its own cookies between calls. */
  function browser() {
    const jar = new Map();
    const call = async (method, path, body, { raw, type = 'application/json' } = {}) => {
      const headers = { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
      if (method !== 'GET') headers['content-type'] = type;
      const r = await fetch(base + path, { method, headers, body: method === 'GET' ? undefined : raw ?? JSON.stringify(body || {}) });
      for (const c of r.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const [k, v] = pair.split('=');
        if (attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a))) jar.delete(k);
        else jar.set(k, v);
      }
      return { status: r.status, headers: r.headers, cookies: r.headers.getSetCookie(), body: await r.json().catch(() => null) };
    };
    return { call, jar, signIn: (email = 'demo@freshmarket.ca', password = 'Fresh123', cart) => call('POST', '/auth/signin', { email, password, cart }) };
  }

  return { base, browser, stripe, env, close: () => new Promise((ok) => server.close(ok)).then(() => db.close()) };
}

module.exports = { startServer, fakeStripe, PK, SK };
