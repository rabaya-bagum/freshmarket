// Unit tests for unexpected server errors (500). Run with: npm run test:api
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const GENERIC = 'Something went wrong on our side. Try again in a moment.';
const quietly = async (fn) => { const orig = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = orig; } };

describe('on your own computer', () => {
  test('GET /api/debug/crash answers 500 with the error and its stack trace', async () => {
    const srv = await startServer({ env: {} });
    const r = await quietly(() => srv.browser().call('GET', '/debug/crash'));
    await srv.close();
    assert.equal(r.status, 500);
    assert.equal(r.body.error, GENERIC);
    assert.equal(r.body.type, 'TypeError');
    assert.equal(r.body.message, "Cannot read properties of undefined (reading 'total')");
    assert.match(r.body.stack.at(1), /server[\\/]app\.js:\d+:\d+/); // the line that broke
  });

  test('a real failure, such as the database going down, shows its stack trace too', async () => {
    const srv = await startServer({ env: {} });
    const real = srv.db.query;
    srv.db.query = async () => { throw new Error('connection refused'); };
    const r = await quietly(() => srv.browser().call('GET', '/products'));
    srv.db.query = real;
    await srv.close();
    assert.equal(r.status, 500);
    assert.equal(r.body.message, 'connection refused');
    assert.ok(r.body.stack.length > 1);
  });
});

describe('on the live site (NODE_ENV=production)', () => {
  test('the crash endpoint does not exist', async () => {
    const srv = await startServer({ env: { NODE_ENV: 'production', SESSION_SECRET: 'test-secret' } });
    const r = await srv.browser().call('GET', '/debug/crash');
    await srv.close();
    assert.equal(r.status, 404);
  });

  test('a real failure answers 500 with no details at all', async () => {
    const srv = await startServer({ env: { NODE_ENV: 'production', SESSION_SECRET: 'test-secret' } });
    const real = srv.db.query;
    srv.db.query = async () => { throw new Error('connection refused at 10.0.0.5'); };
    const r = await quietly(() => srv.browser().call('GET', '/products'));
    srv.db.query = real;
    await srv.close();
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { error: GENERIC });
  });
});
