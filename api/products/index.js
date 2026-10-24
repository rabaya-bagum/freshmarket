// GET /api/products?page=1&per_page=10
// Lists products from the server price list, one page at a time.
const PRICES = require('../../data/prices.json');

const toProduct = (p) => ({ id: p.id, name: p.name, price: p.price, per: p.per, sold_by_weight: Boolean(p.per) });

function positiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET.' });
  }
  const q = req.query || {};
  const page = positiveInt(q.page, 1);
  const perPage = positiveInt(q.per_page, 10);
  if (page === null || perPage === null || perPage > 50) {
    return res.status(400).json({ error: 'page must be a positive whole number and per_page between 1 and 50.' });
  }

  const total = PRICES.length;
  const start = (page - 1) * perPage;
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({
    page,
    per_page: perPage,
    total,
    total_pages: Math.ceil(total / perPage),
    data: PRICES.slice(start, start + perPage).map(toProduct),
  });
}

module.exports = handler;
module.exports.toProduct = toProduct;
