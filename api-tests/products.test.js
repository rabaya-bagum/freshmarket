// Unit tests for the products API. Run with: npm run test:api
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PRODUCTS } = require('../server/catalog');
const { startServer } = require('./helpers');

let srv, b;
before(async () => { srv = await startServer(); b = srv.browser(); });
after(() => srv.close());

describe('GET /api/products', () => {
  test('first page defaults to 10 items', async () => {
    const r = await b.call('GET', '/products');
    assert.equal(r.status, 200);
    assert.equal(r.body.page, 1);
    assert.equal(r.body.per_page, 10);
    assert.equal(r.body.total, PRODUCTS.length);
    assert.equal(r.body.data.length, 10);
    assert.equal(r.body.data[0].name, 'Honeycrisp Apples');
  });

  test('sends everything the store page shows, with stock for each store', async () => {
    const apples = (await b.call('GET', '/products')).body.data[0];
    assert.deepEqual(Object.keys(apples).sort(), ['allergens', 'brand', 'dept', 'desc', 'emoji', 'id', 'isNew', 'local', 'name', 'nf', 'origin', 'per', 'pop', 'price', 'size', 'sold_by_weight', 'stock', 'tags', 'was']);
    assert.equal(apples.sold_by_weight, true);
    assert.deepEqual(apples.stock, [48, 29, 54]); // Square One, Oakville Place, Liberty Village
  });

  test('pages through the list', async () => {
    const r = await b.call('GET', '/products?page=2&per_page=5');
    assert.equal(r.body.data[0].id, PRODUCTS[5].id);
    assert.equal(r.body.total_pages, Math.ceil(PRODUCTS.length / 5));
  });

  test('page past the end is empty, not an error', async () => {
    const r = await b.call('GET', '/products?page=999');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data, []);
  });

  test('bad paging values are refused', async () => {
    for (const q of ['page=0', 'page=abc', 'per_page=51', 'per_page=-1']) {
      assert.equal((await b.call('GET', '/products?' + q)).status, 400, q);
    }
  });

  test('only GET is allowed', async () => {
    const r = await b.call('POST', '/products');
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'GET');
  });
});

describe('GET /api/products/:id', () => {
  test('returns one product', async () => {
    const r = await b.call('GET', '/products/3');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.name, 'Baby Spinach');
    assert.equal(r.body.data.price, 4.99);
    assert.equal(r.body.data.sold_by_weight, false);
  });

  test('unknown id is 404', async () => {
    const r = await b.call('GET', '/products/999999');
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'Product 999999 not found.');
  });

  test('non-numeric id is a server error', async () => {
    const r = await b.call('GET', '/products/a');
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'Server error: product id must be a whole number.');
    assert.equal((await b.call('GET', '/products/abc')).status, 500);
    assert.equal((await b.call('GET', '/products/1.5')).status, 500);
  });

  test('only GET is allowed', async () => {
    assert.equal((await b.call('DELETE', '/products/1')).status, 405);
  });
});
