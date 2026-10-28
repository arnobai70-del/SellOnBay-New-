import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoMode } from '@/lib/demoMode';
import { mayUseDemoAdmin } from '@/lib/admin/mode';
import { demoRegistrarAllowed } from '@/lib/providers/domain/policy';
import { PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF } from '@/lib/stage';

const live = { NODE_ENV: 'production', LAUNCHBAY_DEMO: '1', NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` };

describe('demo mode can never switch the live site off (lib/demoMode.ts)', () => {
  it('works for the demo servers and CI', () => {
    expect(demoMode({ LAUNCHBAY_DEMO: '1' })).toBe(true);
    expect(demoMode({ LAUNCHBAY_DEMO: '1', NEXT_PUBLIC_SITE_URL: 'https://example.com' })).toBe(true);
    expect(demoMode({ LAUNCHBAY_DEMO: '1', NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co` })).toBe(true);
    expect(demoMode({})).toBe(false);
  });
  it('is ignored with the production database or the production address', () => {
    expect(demoMode(live)).toBe(false);
    expect(demoMode({ LAUNCHBAY_DEMO: '1', NEXT_PUBLIC_SITE_URL: 'https://sellonbay.com' })).toBe(false);
    expect(demoMode({ LAUNCHBAY_DEMO: '1', NEXT_PUBLIC_SITE_URL: 'https://www.sellonbay.com/' })).toBe(false);
    expect(mayUseDemoAdmin(live)).toBe(false);
    expect(demoRegistrarAllowed(live)).toBe(false);
  });
  it('no code reads LAUNCHBAY_DEMO except through demoMode (and the launch check that reports it)', () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && /process\.env\.LAUNCHBAY_DEMO|env\.LAUNCHBAY_DEMO/.test(readFileSync(p, 'utf8'))) hits.push(p.replace(/\\/g, '/'));
      }
    };
    for (const d of ['lib', 'app', 'components']) walk(d);
    if (/LAUNCHBAY_DEMO/.test(readFileSync('proxy.ts', 'utf8'))) hits.push('proxy.ts');
    expect(hits.sort()).toEqual(['lib/demoMode.ts', 'lib/launchCheck.ts']);
  });
});
