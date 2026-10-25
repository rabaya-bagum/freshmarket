// Postgres storage for the catalog (products, stores, stock), accounts, carts and orders.
// With DATABASE_URL set (production) it talks to a real Postgres server, such as Neon.
// Without it, it runs PGlite: the same Postgres, compiled to WebAssembly, inside this process.
// PGlite keeps data in DATA_DIR when that is set, otherwise in memory (tests, quick local runs).

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stores (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  addr TEXT NOT NULL,
  close TEXT NOT NULL,
  areas JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  dept TEXT NOT NULL,
  emoji TEXT NOT NULL,
  size TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price > 0),
  was NUMERIC(10,2),
  per TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  local BOOLEAN NOT NULL DEFAULT false,
  pop INT NOT NULL DEFAULT 0,
  is_new BOOLEAN NOT NULL DEFAULT false,
  brand TEXT NOT NULL,
  origin TEXT NOT NULL,
  description TEXT NOT NULL,
  nutrition JSONB NOT NULL,
  allergens TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock (
  store_id INT NOT NULL REFERENCES stores(id),
  product_id INT NOT NULL REFERENCES products(id),
  qty INT NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (store_id, product_id)
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  ns TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  fails INT NOT NULL DEFAULT 0,
  last_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ns, email)
);
CREATE TABLE IF NOT EXISTS carts (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL,
  payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_by_user ON orders (user_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS orders_by_payment ON orders (payment_id) WHERE payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS order_numbers (
  ns TEXT PRIMARY KEY,
  next INT NOT NULL
);
`;

/** @returns {Promise<{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>, close: () => Promise<void>, kind: string}>} */
async function openDb({ url = process.env.DATABASE_URL, dataDir = process.env.DATA_DIR } = {}) {
  let db;
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: url, max: 3 });
    await pool.query(SCHEMA);
    db = { kind: 'postgres', query: (sql, params) => pool.query(sql, params), close: () => pool.end() };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const lite = dataDir ? new PGlite(dataDir) : new PGlite();
    await lite.exec(SCHEMA);
    db = { kind: dataDir ? 'pglite-file' : 'pglite-memory', query: (sql, params) => lite.query(sql, params), close: () => lite.close() };
  }
  // A new database starts with the products, stores and stock from data/ (server/catalog.js)
  await require('./catalog').seedCatalog(db);
  return db;
}

module.exports = { openDb };
