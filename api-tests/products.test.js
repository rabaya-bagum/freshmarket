// Unit tests for the products API. Run with: npm run test:api
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const list = require('../api/products/index');
const one = require('../api/products/[id]');
const PRICES = require('../data/prices.json');

function call(handler, { method = 'GET', query = {} } = {}) {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  handler({ method, query }, res);
  return res;
}

describe('GET /api/products', () => {
  test('first page defaults to 10 items', () => {
    const r = call(list);
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.page, 1);
    assert.equal(r.body.per_page, 10);
    assert.equal(r.body.total, PRICES.length);
    assert.equal(r.body.data.length, 10);
    assert.deepEqual(r.body.data[0], { id: 1, name: 'Honeycrisp Apples', price: 2.99, per: 'lb', sold_by_weight: true });
  });

  test('pages through the list', () => {
    const r = call(list, { query: { page: '2', per_page: '5' } });
    assert.equal(r.body.data[0].id, PRICES[5].id);
    assert.equal(r.body.total_pages, Math.ceil(PRICES.length / 5));
  });

  test('page past the end is empty, not an error', () => {
    const r = call(list, { query: { page: '999' } });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.body.data, []);
  });

  test('bad paging values are refused', () => {
    for (const query of [{ page: '0' }, { page: 'abc' }, { per_page: '51' }, { per_page: '-1' }]) {
      assert.equal(call(list, { query }).statusCode, 400, JSON.stringify(query));
    }
  });

  test('only GET is allowed', () => {
    const r = call(list, { method: 'POST' });
    assert.equal(r.statusCode, 405);
    assert.equal(r.headers.Allow, 'GET');
  });
});

describe('GET /api/products/:id', () => {
  test('returns one product', () => {
    const r = call(one, { query: { id: '3' } });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.body.data, { id: 3, name: 'Baby Spinach', price: 4.99, per: null, sold_by_weight: false });
  });

  test('unknown id is 404', () => {
    const r = call(one, { query: { id: '999999' } });
    assert.equal(r.statusCode, 404);
    assert.equal(r.body.error, 'Product 999999 not found.');
  });

  test('non-numeric id is 400', () => {
    assert.equal(call(one, { query: { id: 'abc' } }).statusCode, 400);
    assert.equal(call(one, { query: { id: '1.5' } }).statusCode, 400);
  });

  test('only GET is allowed', () => {
    assert.equal(call(one, { method: 'DELETE', query: { id: '1' } }).statusCode, 405);
  });
});
