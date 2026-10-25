// The product catalog, the stores and the stock at each store, kept in the database
// (tables made in server/db.js). data/products.json and data/stores.json are only the
// starting data: they fill an empty database the first time the server starts.
const SEED_PRODUCTS = require('../data/products.json');
const SEED_STORES = require('../data/stores.json');

// Starting stock at each store. Square One uses the base figure from products.json.
function seedStock(p, store) {
  if (store === 0) return p.stock;
  if (store === 1) return p.stock === 0 ? 24 : p.id % 7 === 0 ? 0 : Math.max(2, Math.round(p.stock * 0.6));
  return p.stock === 0 ? 12 : p.id % 9 === 4 ? 2 : p.stock + 6;
}

/** Fills empty catalog tables from the JSON files. Safe to run on every start, and from two servers at once. */
async function seedCatalog(db) {
  const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM products');
  if (n > 0) return false;
  // Three statements in all (a remote database answers each one over the network): every row goes in as one JSON list
  const stores = SEED_STORES.map((s, i) => ({ id: i, name: s.name, city: s.city, addr: s.addr, close: s.close, areas: s.areas }));
  const products = SEED_PRODUCTS.map((p) => ({
    id: p.id, name: p.name, dept: p.dept, emoji: p.emoji, size: p.size, price: p.price, was: p.was, per: p.per, tags: p.tags,
    local: p.local, pop: p.pop, is_new: p.isNew, brand: p.brand, origin: p.origin, description: p.desc, nutrition: p.nf, allergens: p.allergens,
  }));
  const stock = SEED_PRODUCTS.flatMap((p) => stores.map((s) => ({ store_id: s.id, product_id: p.id, qty: seedStock(p, s.id) })));
  await db.query(
    `INSERT INTO stores SELECT * FROM jsonb_to_recordset($1::jsonb)
       AS x(id int, name text, city text, addr text, close text, areas jsonb) ON CONFLICT DO NOTHING`,
    [JSON.stringify(stores)]
  );
  await db.query(
    `INSERT INTO products SELECT * FROM jsonb_to_recordset($1::jsonb)
       AS x(id int, name text, dept text, emoji text, size text, price numeric, was numeric, per text, tags jsonb, local boolean,
            pop int, is_new boolean, brand text, origin text, description text, nutrition jsonb, allergens text) ON CONFLICT DO NOTHING`,
    [JSON.stringify(products)]
  );
  await db.query(
    'INSERT INTO stock SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(store_id int, product_id int, qty int) ON CONFLICT DO NOTHING',
    [JSON.stringify(stock)]
  );
  return true;
}

const num = (v) => (v === null ? null : Number(v)); // Postgres sends NUMERIC as text

/**
 * The whole catalog, read from the database: about 50 products, 3 stores and their stock.
 * @returns {Promise<{products: object[], stores: object[], byId: Map<number, object>}>}
 */
async function loadCatalog(db) {
  const [{ rows: storeRows }, { rows: productRows }, { rows: stockRows }] = await Promise.all([
    db.query('SELECT id, name, city, addr, close, areas FROM stores ORDER BY id'),
    db.query('SELECT * FROM products ORDER BY id'),
    db.query('SELECT store_id, product_id, qty FROM stock'),
  ]);
  const stores = storeRows.map((s) => ({ id: s.id, name: s.name, city: s.city, addr: s.addr, close: s.close, areas: s.areas }));
  const qty = new Map(stockRows.map((r) => [`${r.store_id}:${r.product_id}`, r.qty]));
  // The shape the store page uses, with stock listed per store in store order
  const products = productRows.map((p) => ({
    id: p.id, name: p.name, dept: p.dept, emoji: p.emoji, size: p.size, price: num(p.price), was: num(p.was), per: p.per,
    tags: p.tags, local: p.local, pop: p.pop, isNew: p.is_new, brand: p.brand, origin: p.origin, desc: p.description, nf: p.nutrition, allergens: p.allergens,
    sold_by_weight: Boolean(p.per),
    stock: stores.map((s) => qty.get(`${s.id}:${p.id}`) ?? 0),
  }));
  return { products, stores, byId: new Map(products.map((p) => [p.id, p])) };
}

module.exports = { seedCatalog, loadCatalog };
