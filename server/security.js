// Password hashing and signed session cookies, using only Node's built-in crypto.
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEYLEN = 32;

const scrypt = (password, salt) =>
  new Promise((ok, fail) => crypto.scrypt(password, salt, KEYLEN, SCRYPT, (e, key) => (e ? fail(e) : ok(key))));

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${(await scrypt(password, salt)).toString('base64url')}`;
}

// A fixed hash to compare against when the email is unknown, so both cases take the same time
let dummy = null;

async function checkPassword(password, stored) {
  if (!stored) {
    dummy ||= await hashPassword('not-a-real-password');
    stored = dummy;
  }
  const [, salt, hash] = stored.split('$');
  const want = Buffer.from(hash, 'base64url');
  const got = await scrypt(password, Buffer.from(salt, 'base64url'));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** Signs and checks small session tokens: base64url(JSON) + "." + HMAC. */
function sessions(secret) {
  const sign = (body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return {
    create(userId, days = 30) {
      const body = Buffer.from(JSON.stringify({ u: userId, exp: Date.now() + days * 864e5 })).toString('base64url');
      return `${body}.${sign(body)}`;
    },
    read(token) {
      if (typeof token !== 'string') return null;
      const [body, sig] = token.split('.');
      if (!body || !sig) return null;
      const want = Buffer.from(sign(body)), got = Buffer.from(sig);
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
      try {
        const data = JSON.parse(Buffer.from(body, 'base64url').toString());
        return Number.isInteger(data.u) && data.exp > Date.now() ? data.u : null;
      } catch {
        return null;
      }
    },
  };
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = { hashPassword, checkPassword, sessions, parseCookies };
