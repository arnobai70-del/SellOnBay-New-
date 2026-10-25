import { afterEach, describe, expect, it, vi } from 'vitest';
import { authBotCheck, hasNonTestTurnstileKeys, liveSiteKey } from '@/lib/bot/turnstile';

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
