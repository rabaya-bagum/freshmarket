// Calls to the FreshMarket server. Every change is sent as JSON; the server answers with JSON.

export class ApiError extends Error {
  /** @param {string|undefined} serverMsg the server's own explanation, when it gave one */
  constructor(status, serverMsg, fallback = 'Something went wrong on our side. Try again in a moment.') {
    super(serverMsg || fallback);
    this.status = status;
    this.serverMsg = serverMsg;
  }
}

async function call(method, path, body) {
  let r;
  try {
    r = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
  } catch {
    throw new ApiError(0, undefined, 'Could not reach FreshMarket. Check your connection and try again.');
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, j && typeof j.error === 'string' ? j.error : undefined);
  return j;
}

/** Every product, reading as many pages as the server has. */
export async function loadProducts() {
  const all = [];
  for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
    const j = await call('GET', `/products?page=${page}&per_page=50`);
    if (!j || !Array.isArray(j.data)) throw new ApiError(0, undefined, 'The product list could not be read.');
    all.push(...j.data);
    pages = +j.total_pages || 1;
  }
  return all;
}

export const api = {
  config: () => call('GET', '/config'),
  session: () => call('GET', '/session'),
  signIn: (email, password, cart) => call('POST', '/auth/signin', { email, password, cart }),
  signUp: (name, email, password) => call('POST', '/auth/signup', { name, email, password }),
  reset: (email) => call('POST', '/auth/reset', { email }),
  google: (cart) => call('POST', '/auth/google', { cart }),
  signOut: () => call('POST', '/auth/signout'),
  saveCart: (items) => call('PUT', '/cart', { items }),
  paymentIntent: (order) => call('POST', '/create-payment-intent', order),
  placeOrder: (order) => call('POST', '/orders', order),
  advance: (number) => call('POST', `/orders/${encodeURIComponent(number)}/advance`),
};
