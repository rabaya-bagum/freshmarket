// GET /api/products/:id
// Returns one product from the server price list, or 404 if there is no such product.
const PRICES = require('../../data/prices.json');
const { toProduct } = require('./index');

function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET.' });
  }
  const raw = (req.query || {}).id;
  const id = Number(raw);
  if (!/^\d+$/.test(String(raw)) || !Number.isInteger(id)) {
    return res.status(400).json({ error: 'Product id must be a whole number.' });
  }
  const p = PRICES.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: `Product ${id} not found.` });
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({ data: toProduct(p) });
}

module.exports = handler;
