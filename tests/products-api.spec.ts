import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';

// The store takes product names and prices from GET /api/products, and falls back to
// its built-in list when the API is not there. The API is replaced with a stand-in here.
type ApiProduct = { id: number; name: string; price: number; per: string | null };
const PRICES: ApiProduct[] = JSON.parse(readFileSync('data/prices.json', 'utf8'));

const withChanges = (changes: Record<number, Partial<ApiProduct>>) => PRICES.map((p) => ({ ...p, ...changes[p.id] }));

async function fakeProductsApi(page: Page, products: ApiProduct[], perPage = 50) {
  const requested: string[] = [];
  await page.route('**/api/products?*', (r) => {
    const url = new URL(r.request().url());
    requested.push(url.search);
    const n = Number(url.searchParams.get('page') || 1);
    r.fulfill({
      json: {
        page: n,
        per_page: perPage,
        total: products.length,
        total_pages: Math.ceil(products.length / perPage),
        data: products.slice((n - 1) * perPage, n * perPage).map((p) => ({ ...p, sold_by_weight: Boolean(p.per) })),
      },
    });
  });
  return requested;
}

test('shows names and prices from the products API', async ({ store, page }) => {
  await fakeProductsApi(page, withChanges({ 2: { name: 'Organic Bananas', price: 0.99 }, 13: { price: 5.79 } }));
  await page.reload();
  await expect(store.card('Organic Bananas').locator('.price b')).toHaveText('$0.99 /lb');
  await expect(store.card('Sourdough Loaf').locator('.price b')).toHaveText('$5.79');
  await expect(store.card('Bananas')).toHaveCount(0);
});

test('the cart uses the API price', async ({ store, page }) => {
  await fakeProductsApi(page, withChanges({ 13: { price: 5.79 } }));
  await page.reload();
  await expect(store.card('Sourdough Loaf').locator('.price b')).toHaveText('$5.79');
  await store.addToCart('Sourdough Loaf');
  const cart = await store.openCart();
  await expect(cart).toContainText('$5.79');
});

test('drops the sale badge when the API price is not below the old price', async ({ store, page }) => {
  // Honeycrisp Apples are built in at $2.99, was $3.49
  await fakeProductsApi(page, withChanges({ 1: { price: 3.49 } }));
  await page.reload();
  const apples = store.card('Honeycrisp Apples');
  await expect(apples.locator('.price b')).toHaveText('$3.49 /lb');
  await expect(apples.locator('.badge')).toHaveCount(0);
  await expect(apples.locator('.price s')).toHaveCount(0);
});

test('reads every page of the API', async ({ store, page }) => {
  const requested = await fakeProductsApi(page, withChanges({ 50: { price: 14.99 } }), 25);
  await page.reload();
  await store.search.fill('Beef Lasagna');
  await store.search.press('Enter');
  await expect(store.card('Beef Lasagna').locator('.price b')).toHaveText('$14.99');
  expect(requested).toEqual(['?page=1&per_page=50', '?page=2&per_page=50']);
});

test('falls back to the built-in prices when the API is down', async ({ store, page }) => {
  await page.route('**/api/products?*', (r) => r.fulfill({ status: 500, json: { error: 'down' } }));
  await page.reload();
  await expect(store.title).toHaveText('All departments');
  await expect(store.card('Bananas').locator('.price b')).toHaveText('$0.79 /lb');
  await expect(page.locator('#subtitle')).toHaveText('50 products');
});

test('ignores a reply that is not a product list', async ({ store, page }) => {
  await page.route('**/api/products?*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Not found</p>' }));
  await page.reload();
  await expect(store.card('Bananas').locator('.price b')).toHaveText('$0.79 /lb');
});
