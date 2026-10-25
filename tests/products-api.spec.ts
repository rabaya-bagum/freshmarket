import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { test, expect, Store } from './fixtures';

// The store gets every product from GET /api/products; there is no copy in the page.
// Here the API is replaced with a stand-in before the store opens, to check what it does with each kind of reply.
type Product = { id: number; name: string; price: number; was: number | null; per: string | null; stock: number };
const PRODUCTS: Product[] = JSON.parse(readFileSync('data/products.json', 'utf8'));

const withChanges = (changes: Record<number, Partial<Product>>) => PRODUCTS.map((p) => ({ ...p, ...changes[p.id] }));

async function fakeProductsApi(page: Page, products: Product[], perPage = 50) {
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
        data: products.slice((n - 1) * perPage, n * perPage).map((p) => ({ ...p, sold_by_weight: Boolean(p.per), stock: [p.stock, p.stock, p.stock] })),
      },
    });
  });
  return requested;
}

async function open(page: Page) {
  await page.goto('/');
  return new Store(page);
}

test('shows the names and prices the server sends', async ({ page }) => {
  await fakeProductsApi(page, withChanges({ 2: { name: 'Organic Bananas', price: 0.99 }, 13: { price: 5.79 } }));
  const store = await open(page);
  await expect(store.card('Organic Bananas').locator('.price b')).toHaveText('$0.99 /lb');
  await expect(store.card('Sourdough Loaf').locator('.price b')).toHaveText('$5.79');
  await expect(store.card('Bananas')).toHaveCount(0);
});

test('the cart uses the server price', async ({ page }) => {
  await fakeProductsApi(page, withChanges({ 13: { price: 5.79 } }));
  const store = await open(page);
  await expect(store.card('Sourdough Loaf').locator('.price b')).toHaveText('$5.79');
  await store.addToCart('Sourdough Loaf');
  const cart = await store.openCart();
  await expect(cart).toContainText('$5.79');
});

test('shows only the products the server sends', async ({ page }) => {
  await fakeProductsApi(page, PRODUCTS.slice(0, 3));
  const store = await open(page);
  await expect(page.locator('#subtitle')).toHaveText('3 products');
  await expect(store.grid.locator('article.card')).toHaveCount(3);
});

test('reads every page of the API', async ({ page }) => {
  const requested = await fakeProductsApi(page, withChanges({ 50: { price: 14.99 } }), 25);
  const store = await open(page);
  await store.search.fill('Beef Lasagna');
  await store.search.press('Enter');
  await expect(store.card('Beef Lasagna').locator('.price b')).toHaveText('$14.99');
  expect(requested).toEqual(['?page=1&per_page=50', '?page=2&per_page=50']);
});

test('says so when the products cannot load', async ({ page }) => {
  await page.route('**/api/products?*', (r) => r.fulfill({ status: 500, json: { error: 'down' } }));
  await open(page);
  await expect(page.getByRole('alert')).toContainText('Products could not load');
  await expect(page.locator('article.card')).toHaveCount(0);
});

test('treats a reply that is not a product list as a failure', async ({ page }) => {
  await page.route('**/api/products?*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Not found</p>' }));
  await open(page);
  await expect(page.getByRole('alert')).toContainText('Products could not load');
});
