import { afterEach, describe, expect, it, vi } from 'vitest';
import { basicAuthOk, isStaging, openOnStaging, PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF, stagingProblem } from '@/lib/stage';
import { applyControls } from '@/lib/seo/applyControls';
import { DEFAULT_CONTROLS } from '@/lib/seo/controls';

const good = {
  SITE_STAGE: 'staging',
  STAGING_BASIC_AUTH: 'tester:correct-horse-battery',
  NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`,
  NEXT_PUBLIC_SITE_URL: 'https://staging.example.net',
  NEXT_PUBLIC_GA_ID: 'off',
};

afterEach(() => vi.unstubAllEnvs());

describe('staging protection (lib/stage.ts)', () => {
  it('knows the same two projects as the staging guard script', async () => {
    const g = await import('../../scripts/verify-staging-target.mjs');
    expect([g.STAGING_SUPABASE_REF, g.PRODUCTION_SUPABASE_REF]).toEqual([STAGING_SUPABASE_REF, PRODUCTION_SUPABASE_REF]);
  });
  it('is off unless SITE_STAGE=staging, so production is untouched', () => {
    expect(isStaging({})).toBe(false);
    expect(isStaging({ SITE_STAGE: 'production' })).toBe(false);
    expect(isStaging(good)).toBe(true);
  });
  it('refuses to run against production or without a password', () => {
    expect(stagingProblem(good)).toBeNull();
    expect(stagingProblem({ ...good, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` })).toMatch(/PRODUCTION/);
    expect(stagingProblem({ ...good, NEXT_PUBLIC_SUPABASE_URL: 'https://someotherproject000.supabase.co' })).toMatch(/staging project/);
    expect(stagingProblem({ ...good, NEXT_PUBLIC_SITE_URL: 'https://sellonbay.com' })).toMatch(/production address/);
    expect(stagingProblem({ ...good, NEXT_PUBLIC_SITE_URL: 'https://www.sellonbay.com/x' })).toMatch(/production address/);
    expect(stagingProblem({ ...good, STAGING_BASIC_AUTH: undefined })).toMatch(/STAGING_BASIC_AUTH/);
    expect(stagingProblem({ ...good, STAGING_BASIC_AUTH: 'tester:short' })).toMatch(/12 characters/);
    expect(stagingProblem({ ...good, NEXT_PUBLIC_GA_ID: undefined })).toMatch(/GA4/); // the default would be the production property
  });
  it('checks the Basic sign-in exactly', () => {
    const header = (s: string) => 'Basic ' + btoa(s);
    expect(basicAuthOk(header('tester:correct-horse-battery'), good.STAGING_BASIC_AUTH)).toBe(true);
    expect(basicAuthOk(header('tester:correct-horse-batter'), good.STAGING_BASIC_AUTH)).toBe(false);
    expect(basicAuthOk(header('tester:correct-horse-battery!'), good.STAGING_BASIC_AUTH)).toBe(false);
    expect(basicAuthOk('Bearer abc', good.STAGING_BASIC_AUTH)).toBe(false);
    expect(basicAuthOk('Basic %%%', good.STAGING_BASIC_AUTH)).toBe(false);
    expect(basicAuthOk(null, good.STAGING_BASIC_AUTH)).toBe(false);
  });
  it('only the health check and the secret-protected cron jobs skip the password', () => {
    expect(openOnStaging('/api/health')).toBe(true);
    expect(openOnStaging('/api/cron/orders')).toBe(true);
    for (const p of ['/', '/login', '/api/tickets', '/dashboard/admin', '/api/healthz', '/robots.txt']) expect(openOnStaging(p)).toBe(false);
  });
  it('page metadata says noindex on staging and keeps the page own setting in production', () => {
    const indexable = { ...DEFAULT_CONTROLS, status: 'published' as const, index: true, follow: true };
    vi.stubEnv('SITE_STAGE', '');
    const prod = applyControls('/faq', { title: 'FAQ' }, indexable).robots as { index?: boolean } | undefined;
    expect(prod?.index ?? true).toBe(true);
    vi.stubEnv('SITE_STAGE', 'staging');
    expect(applyControls('/faq', { title: 'FAQ' }, indexable).robots).toEqual({ index: false, follow: false });
  });
  it('robots.txt disallows everything and the sitemap is empty on staging only', async () => {
    vi.stubEnv('SITE_STAGE', 'staging');
    const robots = (await import('@/app/robots')).default;
    const sitemap = (await import('@/app/sitemap')).default;
    expect(await robots()).toEqual({ rules: [{ userAgent: '*', disallow: '/' }] });
    expect(await sitemap()).toEqual([]);
    vi.stubEnv('SITE_STAGE', '');
    expect((await robots()).sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
