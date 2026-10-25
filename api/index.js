// Vercel entry point. vercel.json sends every /api/* request here, and Express routes it.
// Vercel serves the built React store (dist/) itself.
const { openDb } = require('../server/db');
const { createApp } = require('../server/app');

let ready = null;
function getApp() {
  ready ||= openDb().then((db) => {
    if (db.kind !== 'postgres') console.warn('FreshMarket: DATABASE_URL is not set, so accounts and orders are kept in memory and lost whenever Vercel restarts the server.');
    return createApp({ db });
  });
  return ready;
}

module.exports = async (req, res) => (await getApp())(req, res);
