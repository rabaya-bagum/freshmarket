import { test, expect } from './fixtures';

// Sample data: 3 stores, each with its own stock and delivery area
test.describe('Stores and per-store stock', () => {
  const picker = (page) => page.getByRole('combobox', { name: 'Choose your store' });

  test('offers 3 stores with Square One selected by default', async ({ store, page }) => {
    await expect(store.title).toHaveText('All departments');
    await expect(picker(page).locator('option')).toHaveText([
      'FreshMarket Mississauga · Square One',
      'FreshMarket Oakville · Oakville Place',
      'FreshMarket Toronto · Liberty Village',
    ]);
    await expect(picker(page)).toHaveValue('0');
    await expect(page.locator('#storeHours')).toHaveText('Open until 10 pm');
  });

  test('switching store updates hours and stock', async ({ store, page }) => {
    await picker(page).selectOption({ label: 'FreshMarket Oakville · Oakville Place' });
    await expect(page.locator('#toast')).toHaveText('Switched to Oakville Place');
    await expect(page.locator('#storeHours')).toHaveText('Open until 9 pm');

    // Strawberries are sold out at Square One but in stock at Oakville
    await store.department('Produce');
    await expect(store.card('Strawberries').getByRole('button', { name: 'Add to cart' })).toBeVisible();
    await store.card('Strawberries').getByRole('button', { name: 'Strawberries', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Strawberries' }).locator('.stock')).toHaveText('In stock at Oakville Place');
  });

  test('switching store re-checks the cart against the new stock', async ({ store, page }) => {
    await store.department('Meat & Seafood');
    await store.addToCart('Lean Ground Beef');
    for (let i = 0; i < 2; i++) await store.card('Lean Ground Beef').getByRole('button', { name: 'Increase' }).click();
    await expect(store.cartCount).toHaveText('3');

    await picker(page).selectOption({ label: 'FreshMarket Oakville · Oakville Place' });
    await expect(page.locator('#toast')).toHaveText('Switched to Oakville Place. 1 cart item adjusted to match stock.');
    await expect(store.cartCount).toHaveText('2');
  });

  test('chosen store is remembered after reload', async ({ store, page }) => {
    await picker(page).selectOption({ label: 'FreshMarket Toronto · Liberty Village' });
    await page.reload();
    await expect(store.title).toHaveText('All departments');
    await expect(picker(page)).toHaveValue('2');
    await expect(page.locator('#storeHours')).toHaveText('Open until 11 pm');
  });
});
