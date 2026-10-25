// Unit tests for the catalog in the database (products, stores, stock). Run with: npm run test:api
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { seedCatalog } = require('../server/catalog');
const { startServer } = require('./helpers');
const SEED_PRODUCTS = require('../data/products.json');
const SEED_STORES = require('../data/stores.json');

const OIL = 25; // Extra Virgin Olive Oil, $13.99

describe('a new database', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(() => srv.close());

  test('starts with the products, stores and stock from data/', async () => {
    const count = async (table) => (await srv.db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    assert.equal(await count('products'), SEED_PRODUCTS.length);
    assert.equal(await count('stores'), SEED_STORES.length);
    assert.equal(await count('stock'), SEED_PRODUCTS.length * SEED_STORES.length);
  });

  test('is only filled once', async () => {
    assert.equal(await seedCatalog(srv.db), false);
    assert.equal((await srv.db.query('SELECT count(*)::int AS n FROM products')).rows[0].n, SEED_PRODUCTS.length);
  });

  test('keeps prices as exact numbers', async () => {
    const { rows: [p] } = await srv.db.query('SELECT price, was FROM products WHERE id = $1', [OIL]);
    assert.equal(Number(p.price), 13.99);
    assert.equal(Number(p.was), 15.99);
  });
});

describe('GET /api/stores', () => {
  test('lists the stores in order, with their delivery areas', async () => {
    const srv = await startServer();
    const r = await srv.browser().call('GET', '/stores');
    await srv.close();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.map((s) => s.name), ['Square One', 'Oakville Place', 'Liberty Village']);
    assert.deepEqual(r.body.data[0], { id: 0, name: 'Square One', city: 'Mississauga', addr: '100 City Centre Dr, Mississauga, ON L5B 2C9', close: '10 pm', areas: ['L4Z', 'L5A', 'L5B', 'L5C', 'L5M', 'L5R'] });
  });
});

describe('the database is the only source', () => {
  let srv, b;
  before(async () => { srv = await startServer(); b = srv.browser(); await b.signIn(); });
  after(() => srv.close());

  test('a price changed in the database shows in the API and in what orders cost', async () => {
    await srv.db.query('UPDATE products SET price = 10.00 WHERE id = $1', [OIL]);
    assert.equal((await b.call('GET', `/products/${OIL}`)).body.data.price, 10);
    const r = await b.call('POST', '/orders', { store: 0, mode: 'pickup', items: [{ id: OIL, q: 2 }], when: 'Wed, Oct 14, 10 am – 11 am', paidWith: 'Apple Pay' });
    assert.equal(r.status, 201);
    assert.equal(r.body.order.sub, 20);
  });

  test('stock changed in the database is what orders are checked against', async () => {
    await srv.db.query('UPDATE stock SET qty = 1 WHERE store_id = 0 AND product_id = $1', [OIL]);
    assert.deepEqual((await b.call('GET', `/products/${OIL}`)).body.data.stock.at(0), 1);
    const r = await b.call('POST', '/orders', { store: 0, mode: 'pickup', items: [{ id: OIL, q: 2 }], when: 'Wed, Oct 14, 10 am – 11 am', paidWith: 'Apple Pay' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'Only 1 of Extra Virgin Olive Oil left at Square One.');
  });

  test('a product added to the database appears in the list', async () => {
    await srv.db.query(
      `INSERT INTO products (id, name, dept, emoji, size, price, brand, origin, description, nutrition, allergens)
       VALUES (51, 'Cranberry Juice', 'Pantry', '🧃', '1.89 L', 4.29, 'Ocean Spray', 'Canada', 'Tart and bright.', '{"cal":110,"fat":"0 g","carb":"28 g","prot":"0 g","sod":"10 mg"}', 'None')`
    );
    const r = await b.call('GET', '/products?per_page=50&page=2');
    assert.equal(r.body.total, 51);
    assert.equal(r.body.data.at(0).name, 'Cranberry Juice');
    assert.deepEqual(r.body.data.at(0).stock, [0, 0, 0]); // no stock rows yet = out of stock everywhere
  });
});
