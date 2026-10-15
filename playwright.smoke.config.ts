import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against a real deployment (Vercel preview or production), not a local server.
// SMOKE_URL is the deployment address. If Vercel Deployment Protection is on for previews,
// VERCEL_AUTOMATION_BYPASS_SECRET lets the tests through.
const baseURL = process.env.SMOKE_URL;
if (!baseURL) throw new Error('Set SMOKE_URL to the deployment address, e.g. https://freshmarket-gules.vercel.app');

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests-smoke',
  retries: 2, // a live site can have a slow first request; retry before calling it broken
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'smoke-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: bypass ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
