// Server-side pricing. The browser only sends product IDs and quantities;
// prices and totals are always worked out here, so nobody can change what they pay.
const { byId } = require('./catalog');

const DELIVERY_FEE = 4.99;
const FREE_DELIVERY = 50;
const DELIVERY_MIN = 35;
const HST_RATE = 0.13 * 0.25; // demo estimate: most groceries are zero-rated, so HST applies to about a quarter of the basket
const WEIGHTED_HOLD = 1.1; // pre-authorize 10% extra when items are sold by weight

class PricingError extends Error {}

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{items: {id:number, q:number}[], mode: 'delivery'|'pickup'}} order
 * @returns {{lines: {p:object, q:number}[], subtotal:number, saved:number, hst:number, fee:number, total:number, weighted:boolean, amountCents:number, captureMethod:'automatic'|'manual'}}
 */
function priceOrder(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) throw new PricingError('Your cart is empty.');
  if (order.items.length > 100) throw new PricingError('Too many items in one order.');
  if (order.mode !== 'delivery' && order.mode !== 'pickup') throw new PricingError('Choose delivery or pickup.');

  let subtotal = 0;
  let saved = 0;
  let weighted = false;
  const lines = [];
  for (const { id, q } of order.items) {
    const p = byId.get(id);
    if (!p) throw new PricingError(`Unknown product ${id}.`);
    if (!Number.isInteger(q) || q < 1 || q > 99) throw new PricingError(`Invalid quantity for ${p.name}.`);
    subtotal += p.price * q;
    if (p.was) saved += (p.was - p.price) * q;
    if (p.per) weighted = true;
    lines.push({ p, q });
  }

  subtotal = r2(subtotal);
  if (order.mode === 'delivery' && subtotal < DELIVERY_MIN) {
    throw new PricingError(`Delivery needs a minimum order of $${DELIVERY_MIN.toFixed(2)}.`);
  }
  // Same arithmetic and rounding as the checkout page, so the charge always matches what the shopper saw
  const hstRaw = subtotal * HST_RATE;
  const fee = order.mode === 'pickup' || subtotal >= FREE_DELIVERY ? 0 : DELIVERY_FEE;
  const totalRaw = subtotal + hstRaw + fee;
  const hst = r2(hstRaw);
  const total = r2(totalRaw);
  const charge = weighted ? r2(totalRaw * WEIGHTED_HOLD) : total;

  return {
    lines,
    subtotal,
    saved: r2(saved),
    hst,
    fee,
    total,
    weighted,
    amountCents: Math.round(charge * 100),
    // Weighted orders are authorized now and captured after picking, for the actual weight.
    captureMethod: weighted ? 'manual' : 'automatic',
  };
}

module.exports = { priceOrder, PricingError };
