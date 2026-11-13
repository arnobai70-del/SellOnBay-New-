import { defineConfig } from '@playwright/test';
import { PRODUCTION_SUPABASE_REF } from './lib/stage';

// Never against production (owner, 2026-11-11: test rows reached the live admin log). The demo specs need a server without a database, and the
// real-server specs a staging project; a run that carries the production project's address stops here.
if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(PRODUCTION_SUPABASE_REF)) throw new Error('E2E tests never run against the production Supabase project. Use a staging project.');

/*
 * End-to-end tests run against an already running, built app (npm run build first):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake SUPABASE_SERVICE_ROLE_KEY=fake LAUNCHBAY_DEMO=1 \
 *     PAYMENT_WEBHOOK_SECRET=e2e-hook-secret npx next build && npx next start -p 3002         demo mode, no database (fake keys at BUILD
 *     time too: .env.local holds the production keys and NEXT_PUBLIC_* are baked into the build)
 *   REAL_URL: a STAGING server only (keys from ~/.sob-staging), never .env.local.
 * tests/e2e/preflight.ts stops the run if any target uses the production database; lib/testGuard.ts refuses marked test requests there.
 * They use the installed Microsoft Edge, so no browser download is needed. Run: npm run test:e2e
 */
export const DEMO_URL = process.env.DEMO_URL ?? 'http://localhost:3002';
export const REAL_URL = process.env.REAL_URL ?? 'http://localhost:3000';
// REAL_URL may be the local staging server (lib/stage.ts). Its password is sent only to a server that asks for it (a 401 challenge),
// which only the staging servers do; the demo servers never ask.
const [stageUser, stagePass] = (process.env.STAGING_BASIC_AUTH ?? '').split(':');
const stageLogin = stageUser && stagePass ? { httpCredentials: { username: stageUser, password: stagePass, send: 'unauthorized' as const } } : {};

export default defineConfig({
  // Before any test: every target server must be off the production database (tests/e2e/preflight.ts, lib/testGuard.ts).
  globalSetup: './tests/e2e/preflight.ts',
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
    // Marks every request as a test, so a server on the production database refuses it (lib/testGuard.ts).
    extraHTTPHeaders: { 'x-sob-e2e': '1' },
    ...stageLogin,
  },
});
