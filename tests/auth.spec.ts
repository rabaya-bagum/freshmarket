import { test, expect } from '@playwright/test';
import { openStore } from './helpers';

// GP-1: Customer account registration & login
test.describe('GP-1 Account registration & login', () => {
  test.beforeEach(async ({ page }) => {
    await openStore(page);
    await page.getByRole('button', { name: 'Sign in' }).click();
  });

  const form = (page) => page.locator('form');

  test('signs in with valid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByLabel('Password').fill('Fresh123');
    await form(page).getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#acct')).toHaveText('Hi, Demo');
  });

  test('shows a clear error for a wrong password', async ({ page }) => {
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByLabel('Password').fill('wrong-pass');
    await form(page).getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.err')).toContainText("That email and password don't match");
    await expect(page.locator('.err')).toContainText('4 attempts left');
  });

  test('locks the account after 5 failed attempts', async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await page.getByLabel('Email').fill('demo@freshmarket.ca');
      await page.getByLabel('Password').fill('wrong-pass');
      await form(page).getByRole('button', { name: 'Sign in' }).click();
    }
    await expect(page.locator('.err')).toContainText('locked after 5 failed attempts');
  });

  test('creates an account and requires email verification', async ({ page }) => {
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByLabel('Full name').fill('Test Shopper');
    await page.getByLabel('Email').fill('new@shopper.ca');
    await page.getByLabel('Password').fill('Grocery2026');
    await form(page).getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.okmsg')).toContainText('verification link');
  });

  test('rejects a password without a number', async ({ page }) => {
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByLabel('Full name').fill('Test Shopper');
    await page.getByLabel('Email').fill('nonumber@shopper.ca');
    await page.getByLabel('Password').fill('NoNumbersHere');
    await form(page).getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.err')).toContainText('at least one number');
  });

  test('sends a password reset link', async ({ page }) => {
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('.okmsg')).toContainText('reset link is on its way');
  });
});
