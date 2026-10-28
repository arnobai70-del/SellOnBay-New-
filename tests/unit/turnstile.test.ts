import { afterEach, describe, expect, it, vi } from 'vitest';
import { authBotCheck, hasNonTestTurnstileKeys, liveSiteKey, stagingTestKeysAllowed, verifyTurnstile } from '@/lib/bot/turnstile';
import { PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF } from '@/lib/stage';

describe('Turnstile production credentials gate', () => {
  it('rejects missing or partial credentials', () => {
    expect(hasNonTestTurnstileKeys('', '')).toBe(false);
    expect(hasNonTestTurnstileKeys('0xreal-site-key', '')).toBe(false);
    expect(hasNonTestTurnstileKeys('', '0xreal-secret-key')).toBe(false);
  });

  it('rejects all standard Cloudflare TEST key families even when set in env', () => {
    const sampleSites = ['1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF'];
    const sampleSecrets = ['1x0000000000000000000000000000000AA', '2x0000000000000000000000000000000AA'];
    for (const site of sampleSites) expect(hasNonTestTurnstileKeys(site, '0xreal-secret-key')).toBe(false);
    for (const secret of sampleSecrets) expect(hasNonTestTurnstileKeys('0xreal-site-key', secret)).toBe(false);
  });

  it('accepts configured non-test-shaped keys for provider verification (not proof of validity)', () => {
    expect(hasNonTestTurnstileKeys('0xreal-site-key', '0xreal-secret-key')).toBe(true);
  });
});

describe('bot check on sign in, sign up and password reset', () => {
  const keep = { site: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, secret: process.env.TURNSTILE_SECRET_KEY };
  const restore = () => {
    for (const [k, v] of [
      ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', keep.site],
      ['TURNSTILE_SECRET_KEY', keep.secret],
    ] as const)
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  };
  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
  });

  it('lets people in while only test keys exist, and shows no widget', async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await authBotCheck('', '1.2.3.4')).toBe(true);
    expect(liveSiteKey()).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('with real keys: needs a token Cloudflare accepts, and gives the browser the site key', async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = ' 0xreal-site-key ';
    process.env.TURNSTILE_SECRET_KEY = '0xreal-secret-key';
    expect(liveSiteKey()).toBe('0xreal-site-key');
    expect(await authBotCheck('', '1.2.3.4')).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }))),
    );
    expect(await authBotCheck('bad-token', '1.2.3.4')).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }))),
    );
    expect(await authBotCheck('good-token', '1.2.3.4')).toBe(true);
  });
});

describe('Cloudflare test keys on a staging server only', () => {
  const staging = {
    SITE_STAGE: 'staging',
    STAGING_BASIC_AUTH: 'tester:Staging-Password-0123456789',
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`,
    NEXT_PUBLIC_SITE_URL: 'https://staging.sellonbay.com',
    NEXT_PUBLIC_GA_ID: 'off',
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('allowed only when every staging safety rule holds', () => {
    expect(stagingTestKeysAllowed(staging)).toBe(true);
    expect(stagingTestKeysAllowed({})).toBe(false);
    expect(stagingTestKeysAllowed({ ...staging, SITE_STAGE: 'production' })).toBe(false);
    expect(stagingTestKeysAllowed({ ...staging, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` })).toBe(false);
    expect(stagingTestKeysAllowed({ ...staging, NEXT_PUBLIC_SITE_URL: 'https://sellonbay.com' })).toBe(false);
    expect(stagingTestKeysAllowed({ ...staging, STAGING_BASIC_AUTH: '' })).toBe(false);
  });
  it('a production build without real keys still refuses every token, and asks Cloudflare nothing', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${PRODUCTION_SUPABASE_REF}.supabase.co`);
    vi.stubEnv('LAUNCHBAY_DEMO', '1'); // ignored on the production project (lib/demoMode.ts)
    expect(await verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', '203.0.113.1')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('the staging server verifies with the test secret', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    for (const [k, v] of Object.entries(staging)) vi.stubEnv(k, v);
    expect(await verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', '203.0.113.1')).toBe(true);
    expect(String((fetch.mock.calls[0] as unknown[])[1] && ((fetch.mock.calls[0] as unknown[])[1] as RequestInit).body)).toContain('secret=1x0000');
  });
});
