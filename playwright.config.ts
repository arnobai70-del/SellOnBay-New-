import { defineConfig } from '@playwright/test';
import { PRODUCTION_SUPABASE_REF } from './lib/stage';

// Never against production (owner, 2026-11-11: test rows reached the live admin log). The demo specs need a server without a database, and the
// real-server specs a staging project; a run that carries the production project's address stops here.
if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(PRODUCTION_SUPABASE_REF)) throw new Error('E2E tests never run against the production Supabase project. Use a staging project.');

/*
 * End-to-end tests run against an already running, built app (npm run build first):
 *   PAYMENT_WEBHOOK_SECRET=e2e-hook-secret LAUNCHBAY_DEMO=1 npx next start -p 3002    demo mode, no database
 *   PAYMENT_WEBHOOK_SECRET=e2e-hook-secret EXAMPLE_ORDERS=1 npx next start -p 3000     real Supabase from .env.local (examples can be bought: test server only)
 * They use the installed Microsoft Edge, so no browser download is needed. Run: npm run test:e2e
 */
export const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3002';
export const REAL_URL = process.env.REAL_URL ?? 'http://localhost:3000';
// REAL_URL may be the local staging server (lib/stage.ts). Its password is sent only to a server that asks for it (a 401 challenge),
// which only the staging servers do; the demo servers never ask.
const [stageUser, stagePass] = (process.env.STAGING_BASIC_AUTH ?? '').split(':');
const stageLogin = stageUser && stagePass ? { httpCredentials: { username: stageUser, password: stagePass, send: 'unauthorized' as const } } : {};

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
    ...stageLogin,
  },
});
