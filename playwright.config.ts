import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // The real server with a fresh in-memory database. FM_SANDBOX gives every test's browser its own
  // private accounts, carts and orders, so tests running side by side never see each other's data.
  webServer: {
    command: 'npm run build && node server/index.js',
    env: { PORT: '4173', FM_SANDBOX: '1', DATABASE_URL: '', DATA_DIR: '' },
    url: 'http://localhost:4173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
