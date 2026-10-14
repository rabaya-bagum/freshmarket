import { test, expect, Page } from '@playwright/test';
import { openStore } from './helpers';

// GP-4: Product detail page
test.describe('GP-4 Product detail page', () => {
  test.beforeEach(async ({ page }) => openStore(page));

  const open = async (page: Page, name: string) => {
    await page.locator('#q').fill(name);
    await page.locator('#q').press('Enter');
    await page.locator('.pname', { hasText: name }).first().click();
    const d = page.getByRole('dialog', { name });
    await expect(d).toBeVisible();
    return d;
  };

  test('shows name, brand, size, origin and description', async ({ page }) => {
    const d = await open(page, 'Sourdough Loaf');
    await expect(d.locator('h2')).toHaveText('Sourdough Loaf');
    await expect(d.locator('.size')).toHaveText('FreshMarket Bakehouse · 675 g');
    await expect(d.locator('.local')).toHaveText('Ontario grown · Ontario');
    await expect(d).toContainText('Naturally leavened, baked fresh each morning.');
  });

  test('shows nutrition facts and allergens', async ({ page }) => {
    const d = await open(page, 'Butter Croissants');
    const nf = d.locator('.nf div');
    await expect(nf).toHaveText([/Calories\s*230/, /Fat\s*12 g/, /Carbohydrate\s*26 g/, /Protein\s*5 g/, /Sodium\s*260 mg/]);
    await expect(d.locator('.allergen')).toHaveText('Contains: Wheat, Milk, Egg');
  });

  test('shows dietary tags', async ({ page }) => {
    const d = await open(page, 'Hass Avocados');
    await expect(d.locator('.tag')).toHaveText(['vegan', 'gluten-free']);
  });

  test('shows price per lb and per kg for weighted items', async ({ page }) => {
    const d = await open(page, 'Atlantic Salmon Fillet');
    await expect(d.locator('.price b')).toHaveText('$13.99 /lb');
    await expect(d.locator('.price s')).toHaveText('$16.99');
    await expect(d).toContainText('$30.84 /kg');
    await expect(d).toContainText("You'll be charged for the actual weight picked.");
  });

  test('items sold by unit have no per-kg price or weight note', async ({ page }) => {
    const d = await open(page, 'Sourdough Loaf');
    await expect(d).not.toContainText('/kg');
    await expect(d).not.toContainText('actual weight');
  });

  test('shows in-stock, low-stock and out-of-stock states', async ({ page }) => {
    let d = await open(page, 'Sourdough Loaf');
    await expect(d.locator('.stock')).toHaveText('In stock at Square One');
    await expect(d.locator('.stock')).toHaveClass(/ok/);
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();

    d = await open(page, 'Lean Ground Beef');
    await expect(d.locator('.stock')).toHaveText('Only 3 left at Square One');
    await expect(d.locator('.stock')).toHaveClass(/low/);
    await page.keyboard.press('Escape');

    d = await open(page, 'Strawberries');
    await expect(d.locator('.stock')).toHaveText('Out of stock at Square One');
    await expect(d.locator('.stock')).toHaveClass(/out/);
    await expect(d.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
    await expect(d.locator('.oos')).toHaveText('Out of stock at this store');
  });

  test('adds to cart and switches to a quantity control', async ({ page }) => {
    const d = await open(page, 'Hass Avocados');
    await d.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.locator('#count')).toHaveText('1');
    await expect(d.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
    await expect(d.locator('.qty span')).toHaveText('1');

    await d.getByRole('button', { name: 'Increase' }).click();
    await expect(d.locator('.qty span')).toHaveText('2');
    await expect(page.locator('#count')).toHaveText('2');
  });

  test('closes with the close button and with Escape', async ({ page }) => {
    let d = await open(page, 'Lemons');
    await d.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    d = await open(page, 'Lemons');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
