// Runs FreshMarket on this computer: the API plus the React store.
//   npm run dev    → React with live reload (Vite), API on the same port
//   npm start      → the built store from dist/ (run npm run build first)
// PORT (default 3000), DATABASE_URL, DATA_DIR, STRIPE_* and SESSION_SECRET are read from the environment.
// FM_SANDBOX=1 gives every browser its own private data; the browser tests use it so they never share accounts or orders.
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const { createApp } = require('./app');

async function main() {
  const dev = process.argv.includes('--dev');
  const db = await openDb();
  const app = createApp({ db, sandbox: process.env.FM_SANDBOX === '1' });
  const root = path.join(__dirname, '..');

  if (dev) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(root, 'dist'), { index: 'index.html' }));
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`FreshMarket on http://localhost:${port} (${dev ? 'dev' : 'built'} store, ${db.kind} database)`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
