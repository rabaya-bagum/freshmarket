// The product catalog and stores. This is the one copy the whole app trusts:
// the store page loads it from /api/products, and orders are priced from it.
const PRODUCTS = require('../data/products.json');
const STORES = require('../data/stores.json');

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

// Stock differs by store. Square One uses the base figure.
function stockAt(p, store) {
  if (store === 0) return p.stock;
  if (store === 1) return p.stock === 0 ? 24 : p.id % 7 === 0 ? 0 : Math.max(2, Math.round(p.stock * 0.6));
  return p.stock === 0 ? 12 : p.id % 9 === 4 ? 2 : p.stock + 6;
}

// What the browser gets for each product: everything, with stock listed per store (in STORES order)
const toProduct = (p) => ({ ...p, sold_by_weight: Boolean(p.per), stock: STORES.map((_, i) => stockAt(p, i)) });

module.exports = { PRODUCTS, STORES, byId, stockAt, toProduct };
