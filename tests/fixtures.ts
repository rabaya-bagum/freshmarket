import { test as base, expect, Page } from '@playwright/test';

export class Store {
  constructor(readonly page: Page) {}

  get search() { return this.page.getByRole('searchbox', { name: 'Search products' }); }
  get suggestions() { return this.page.locator('#suggest'); }
  get grid() { return this.page.locator('#grid'); }
  get cartCount() { return this.page.locator('#count'); }
  get accountButton() { return this.page.locator('#acct'); }
  get title() { return this.page.getByRole('heading', { level: 1 }); }

  card(name: string) {
    return this.page.locator('article.card').filter({ has: this.page.getByRole('button', { name, exact: true }) });
  }

  async addToCart(name: string) {
    await this.card(name).getByRole('button', { name: 'Add to cart' }).click();
  }

  async openCart() {
    await this.page.locator('#cartBtn').click();
    return this.page.getByRole('dialog', { name: 'Your cart' });
  }

  async department(name: string) {
    await this.page.getByRole('navigation', { name: 'Departments' }).getByRole('button', { name, exact: true }).click();
  }

  async signIn(email: string, password: string) {
    await this.accountButton.click();
    const dialog = this.page.getByRole('dialog', { name: 'Sign in' });
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Password').fill(password);
    await dialog.locator('form').getByRole('button', { name: 'Sign in' }).click();
    return dialog;
  }
}

export const test = base.extend<{ store: Store }>({
  store: async ({ page }, use) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await use(new Store(page));
  },
});

export { expect };

export const DEMO = { email: 'demo@freshmarket.ca', password: 'Fresh123' };
