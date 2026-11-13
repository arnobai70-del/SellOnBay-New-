import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { testGuard } from '@/lib/testGuard';

const PROD = { NEXT_PUBLIC_SUPABASE_URL: 'https://knvxtgzrylvkhyrcezlq.supabase.co' };
const STAGING = { NEXT_PUBLIC_SUPABASE_URL: 'https://occketfmjwciilzuddkv.supabase.co' };
const FAKE = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9' };

describe('production database guard for tests (owner, 2026-11-13)', () => {
  it('refuses a marked test request on a production-database server, wherever it runs', () => {
    expect(testGuard(PROD, 'localhost:3002', '1')?.status).toBe(403);
    expect(testGuard(PROD, 'sellonbay.com', '1')?.status).toBe(403);
  });
  it('a demo server started with production keys answers 503, except for the live addresses', () => {
    expect(testGuard({ ...PROD, LAUNCHBAY_DEMO: '1' }, 'localhost:3002', null)?.status).toBe(503);
    expect(testGuard({ ...PROD, LAUNCHBAY_DEMO: '1' }, '127.0.0.1:3002', null)?.status).toBe(503);
    expect(testGuard({ ...PROD, LAUNCHBAY_DEMO: '1' }, 'sellonbay.com', null)).toBeNull();
    expect(testGuard({ ...PROD, LAUNCHBAY_DEMO: '1' }, 'www.sellonbay.com:443', null)).toBeNull();
  });
  it('leaves normal production traffic, staging and database-free servers alone', () => {
    expect(testGuard(PROD, 'sellonbay.com', null)).toBeNull();
    expect(testGuard(PROD, 'localhost:3000', null)).toBeNull(); // the owner's own local server on the working database
    expect(testGuard(STAGING, 'localhost:3010', '1')).toBeNull();
    expect(testGuard({ ...FAKE, LAUNCHBAY_DEMO: '1' }, 'localhost:3002', '1')).toBeNull();
    expect(testGuard({}, 'localhost:3002', '1')).toBeNull();
  });
  it('is wired in: the proxy checks it first, Playwright marks every request and runs the pre-flight', () => {
    const proxy = readFileSync('proxy.ts', 'utf8');
    const body = proxy.slice(proxy.indexOf('export async function proxy('));
    expect(body.indexOf('testGuard(')).toBeGreaterThan(0);
    expect(body.indexOf('testGuard(')).toBeLessThan(body.indexOf('isStaging()'));
    const pw = readFileSync('playwright.config.ts', 'utf8');
    expect(pw).toMatch(/globalSetup: '\.\/tests\/e2e\/preflight\.ts'/);
    expect(pw).toMatch(/extraHTTPHeaders: \{ 'x-sob-e2e': '1' \}/);
    expect(readFileSync('tests/e2e/realEnv.ts', 'utf8')).toMatch(/'x-sob-e2e': '1'/);
  });
  it('no browser test reads .env.local (the production keys); the database specs take staging keys from the environment only', () => {
    const readers = readdirSync('tests/e2e').filter((f) => /readFileSync\([^)]*\.env\.local|'\.env\.local'\)/.test(readFileSync(`tests/e2e/${f}`, 'utf8')));
    expect(readers).toEqual([]);
    const real = readFileSync('tests/e2e/realEnv.ts', 'utf8');
    expect(real).toMatch(/STAGING_SUPABASE_REF/);
    for (const f of ['rls.spec.ts', 'buy-real.spec.ts', 'listing.spec.ts', 'orders.spec.ts']) expect(readFileSync(`tests/e2e/${f}`, 'utf8')).toMatch(/from '\.\/realEnv'/);
  });
});
