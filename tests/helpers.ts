import { Page } from '@playwright/test';

export async function openStore(page: Page) {
  await page.goto('/');
  // start every test with an empty cart
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export const card = (page: Page, name: string) =>
  page.locator('article.card').filter({ has: page.locator('.pname', { hasText: name }) });
