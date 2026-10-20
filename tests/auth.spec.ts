import { test, expect, Page } from '@playwright/test';
import { openStore } from './helpers';

// GP-1: Customer account registration & login
test.describe('GP-1 Account registration & login', () => {
  test.beforeEach(async ({ page }) => {
    await openStore(page);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  });

  const form = (page: Page) => page.locator('form');
  const signIn = async (page: Page, email: string, password: string) => {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await form(page).getByRole('button', { name: 'Sign in' }).click();
  };

  test('signs in with valid credentials', async ({ page }) => {
    await signIn(page, 'demo@freshmarket.ca', 'Fresh123');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#toast')).toHaveText('Signed in. Your cart is saved.');
    await expect(page.locator('#acct')).toHaveText('Hi, Demo');

    // Session persists: account panel shows the signed-in user
    await page.locator('#acct').click();
    await expect(page.getByRole('dialog', { name: 'Account' })).toContainText('demo@freshmarket.ca');
  });

  test('signs out', async ({ page }) => {
    await signIn(page, 'demo@freshmarket.ca', 'Fresh123');
    await page.locator('#acct').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.locator('#toast')).toHaveText('Signed out');
    await expect(page.locator('#acct')).toHaveText('Sign in');
  });

  // GP-81: an empty or incomplete form must never sign anyone in
  test('empty sign-in form asks for the email and stays signed out', async ({ page }) => {
    await form(page).getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter your email address.');
    await expect(page.getByLabel('Email')).toBeFocused();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
    await expect(page.locator('#acct')).toHaveText('Sign in');
  });

  test('email without a password asks for the password', async ({ page }) => {
    await signIn(page, 'demo@freshmarket.ca', '');
    await expect(page.getByRole('alert')).toHaveText('Enter your password.');
    await expect(page.getByLabel('Password')).toBeFocused();
    await expect(page.getByLabel('Email')).toHaveValue('demo@freshmarket.ca');
    await expect(page.locator('#acct')).toHaveText('Sign in');
  });

  test('rejects a badly formatted email before checking the password', async ({ page }) => {
    await signIn(page, 'demo-at-freshmarket', 'Fresh123');
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address, like name@example.com.');
    await expect(page.locator('#acct')).toHaveText('Sign in');
  });

  test('a blank email with the demo password does not sign in', async ({ page }) => {
    await signIn(page, '   ', 'Fresh123');
    await expect(page.getByRole('alert')).toHaveText('Enter your email address.');
    await expect(page.locator('#acct')).toHaveText('Sign in');
  });

  test('empty sign-in from checkout stays signed out', async ({ page }) => {
    await page.keyboard.press('Escape');
    await page.locator('#depts button', { hasText: 'Bakery' }).click();
    await page.locator('.card', { hasText: 'Sourdough Loaf' }).getByRole('button', { name: 'Add to cart' }).click();
    await page.locator('#cartBtn').click();
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await form(page).getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter your email address.');
    await expect(page.locator('#acct')).toHaveText('Sign in');
    await expect(page.getByRole('dialog', { name: 'Checkout' })).toHaveCount(0);
  });

  test('shows a clear error for a wrong password', async ({ page }) => {
    await signIn(page, 'demo@freshmarket.ca', 'wrong-pass');
    await expect(page.locator('.err')).toHaveText(
      "That email and password don't match. 4 attempts left before the account locks."
    );
    await expect(page.locator('#acct')).toHaveText('Sign in');
  });

  test('does not reveal whether an unknown email exists', async ({ page }) => {
    await signIn(page, 'nobody@nowhere.ca', 'whatever1');
    await expect(page.locator('.err')).toHaveText("That email and password don't match.");
  });

  test('counts down remaining attempts', async ({ page }) => {
    for (const left of [4, 3, 2, 1]) {
      await signIn(page, 'demo@freshmarket.ca', 'wrong-pass');
      const word = left === 1 ? 'attempt' : 'attempts';
      await expect(page.locator('.err')).toContainText(`${left} ${word} left`);
    }
  });

  test('locks the account after 5 failed attempts, even for the correct password', async ({ page }) => {
    for (let i = 0; i < 5; i++) await signIn(page, 'demo@freshmarket.ca', 'wrong-pass');
    await signIn(page, 'demo@freshmarket.ca', 'Fresh123');
    await expect(page.locator('.err')).toContainText('locked after 5 failed attempts');
    await expect(page.locator('#acct')).toHaveText('Sign in');
  });

  test('password reset unlocks a locked account', async ({ page }) => {
    for (let i = 0; i < 5; i++) await signIn(page, 'demo@freshmarket.ca', 'wrong-pass');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('.okmsg')).toHaveText(
      'If an account exists for demo@freshmarket.ca, a reset link is on its way.'
    );
    await signIn(page, 'demo@freshmarket.ca', 'Fresh123');
    await expect(page.locator('#acct')).toHaveText('Hi, Demo');
  });

  test('creates an account that must be verified before sign-in', async ({ page }) => {
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByLabel('Full name').fill('Test Shopper');
    await page.getByLabel('Email').fill('new@shopper.ca');
    await page.getByLabel('Password').fill('Grocery2026');
    await form(page).getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.okmsg')).toContainText('We sent a verification link to new@shopper.ca');
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');

    // First sign-in is blocked until the email is verified
    await signIn(page, 'new@shopper.ca', 'Grocery2026');
    await expect(page.locator('.err')).toContainText('Verify your email first');

    // After verification (simulated by the demo), sign-in succeeds
    await signIn(page, 'new@shopper.ca', 'Grocery2026');
    await expect(page.locator('#acct')).toHaveText('Hi, Test');
  });

  test('rejects a duplicate email', async ({ page }) => {
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByLabel('Full name').fill('Someone');
    await page.getByLabel('Email').fill('demo@freshmarket.ca');
    await page.getByLabel('Password').fill('Grocery2026');
    await form(page).getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.err')).toHaveText('An account with this email already exists. Sign in instead.');
  });

  test('rejects a password without a number', async ({ page }) => {
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByLabel('Full name').fill('Test Shopper');
    await page.getByLabel('Email').fill('nonumber@shopper.ca');
    await page.getByLabel('Password').fill('NoNumbersHere');
    await form(page).getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.err')).toHaveText('Add at least one number to your password.');
  });

  test('requires a password of at least 8 characters', async ({ page }) => {
    await page.getByRole('tab', { name: 'Create account' }).click();
    const pw = page.getByLabel('Password');
    await expect(pw).toHaveAttribute('minlength', '8');
    await expect(pw).toHaveAttribute('required', '');
    await expect(page.getByText('At least 8 characters with a number.')).toBeVisible();
  });

  test('signs in with Google', async ({ page }) => {
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#acct')).toHaveText('Hi, Google');
  });
});
