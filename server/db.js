// Postgres storage for accounts, carts and orders.
// With DATABASE_URL set (production) it talks to a real Postgres server, such as Neon.
// Without it, it runs PGlite: the same Postgres, compiled to WebAssembly, inside this process.
// PGlite keeps data in DATA_DIR when that is set, otherwise in memory (tests, quick local runs).

const SCHEMA = `
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
  return db;
}

module.exports = { openDb };
