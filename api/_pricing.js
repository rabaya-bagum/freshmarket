// Server-side pricing. The browser only sends product IDs and quantities;
// prices and totals are always worked out here, so nobody can change what they pay.
const PRICES = require('../data/prices.json');

const DELIVERY_FEE = 4.99;
const FREE_DELIVERY = 50;
const DELIVERY_MIN = 35;
// GP-83: Ontario HST is 13%, charged only on taxable products. Most groceries are zero-rated (CRA GST/HST Memorandum 4-3);
// taxable ones (salads, sushi, chocolate bars) carry "taxable": true in data/prices.json.
const HST_RATE = 0.13;
// The delivery fee is a separate itemized charge, so HST is collected on it. Set to false if your accountant advises otherwise.
const HST_ON_DELIVERY_FEE = true;
const WEIGHTED_HOLD = 1.1; // pre-authorize 10% extra when items are sold by weight

const byId = new Map(PRICES.map((p) => [p.id, p]));

class PricingError extends Error {}

/**
 * @param {{items: {id:number, q:number}[], mode: 'delivery'|'pickup'}} order
 * @returns {{subtotal:number, hst:number, fee:number, total:number, weighted:boolean, amountCents:number, captureMethod:'automatic'|'manual'}}
 */
function priceOrder(order) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) throw new PricingError('Your cart is empty.');
  if (order.items.length > 100) throw new PricingError('Too many items in one order.');
  if (order.mode !== 'delivery' && order.mode !== 'pickup') throw new PricingError('Choose delivery or pickup.');

  let subtotal = 0;
  let taxableSubtotal = 0;
  let weighted = false;
  for (const { id, q } of order.items) {
    const p = byId.get(id);
    if (!p) throw new PricingError(`Unknown product ${id}.`);
    if (!Number.isInteger(q) || q < 1 || q > 99) throw new PricingError(`Invalid quantity for ${p.name}.`);
    subtotal += p.price * q;
    if (p.taxable) taxableSubtotal += p.price * q;
    if (p.per) weighted = true;
  }

  const r2 = (n) => Math.round(n * 100) / 100;
  subtotal = r2(subtotal);
  if (order.mode === 'delivery' && subtotal < DELIVERY_MIN) {
    throw new PricingError(`Delivery needs a minimum order of $${DELIVERY_MIN.toFixed(2)}.`);
  }
  // Same arithmetic and rounding as the checkout page, so the charge always matches what the shopper saw
  const fee = order.mode === 'pickup' || subtotal >= FREE_DELIVERY ? 0 : DELIVERY_FEE;
  const hstRaw = (taxableSubtotal + (HST_ON_DELIVERY_FEE ? fee : 0)) * HST_RATE;
  const totalRaw = subtotal + hstRaw + fee;
  const hst = r2(hstRaw);
  const total = r2(totalRaw);
  const charge = weighted ? r2(totalRaw * WEIGHTED_HOLD) : total;

  return {
    subtotal,
    hst,
    fee,
    total,
    weighted,
    amountCents: Math.round(charge * 100),
    // Weighted orders are authorized now and captured after picking, for the actual weight.
    captureMethod: weighted ? 'manual' : 'automatic',
  };
}

module.exports = { priceOrder, PricingError, HST_RATE, HST_ON_DELIVERY_FEE };
