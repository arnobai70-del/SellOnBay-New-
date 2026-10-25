import { defineConfig } from '@playwright/test';

/*
 * End-to-end tests run against an already running, built app (npm run build first):
 *   PAYMENT_WEBHOOK_SECRET=e2e-hook-secret LAUNCHBAY_DEMO=1 npx next start -p 3002    demo mode, no database
 *   PAYMENT_WEBHOOK_SECRET=e2e-hook-secret EXAMPLE_ORDERS=1 npx next start -p 3000     real Supabase from .env.local (examples can be bought: test server only)
 * They use the installed Microsoft Edge, so no browser download is needed. Run: npm run test:e2e
 */
export const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3002';
export const REAL_URL = process.env.REAL_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    // The cookie notice is closed in every test except the one that checks it (it sits at the bottom of the page and would cover buttons).
    storageState: { cookies: [], origins: [DEMO_URL, REAL_URL, 'http://localhost:3004'].map((origin) => ({ origin, localStorage: [{ name: 'lb-cookies', value: '1' }] })) },
    baseURL: DEMO_URL,
    channel: process.env.PW_CHANNEL ?? 'msedge',
    headless: true,
  },
});
