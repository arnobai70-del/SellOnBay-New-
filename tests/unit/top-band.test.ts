import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The "Deep ocean" top band (owner, 2026-11-14, option C): one shared component on every public page, never on a dashboard, built from CSS
 * only (no blur filter, no JavaScript), and the home hero's floating cards are gone for good.
 */
const read = (p: string) => readFileSync(p, 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
  });

// every page (or the shared body it renders) that must open with the band
const WITH_BAND = [
  'app/(glass)/page.tsx',
  'app/(glass)/websites/page.tsx',
  'app/(glass)/websites/category/[category]/page.tsx',
  'app/(glass)/websites/[slug]/page.tsx',
  'app/(glass)/domains/page.tsx',
  'app/(glass)/sellers/page.tsx',
  'app/(glass)/sellers/[username]/page.tsx',
  'app/(glass)/sell/page.tsx',
  'app/(glass)/help/page.tsx',
  'app/(glass)/guides/page.tsx',
  'app/(glass)/guides/[slug]/page.tsx',
  'components/LegalPage.tsx',
  'app/(glass)/buyer-protection/page.tsx',
  'app/(glass)/cart/CartClient.tsx',
  'app/(glass)/checkout/page.tsx',
  'app/(glass)/checkout/success/page.tsx',
  'components/AuthClient.tsx',
  'app/not-found.tsx',
  'components/MaintenanceNotice.tsx',
  'app/(glass)/affiliates/page.tsx',
  'app/(glass)/subscriptions/page.tsx',
  'app/(site)/search/page.tsx',
  'app/(site)/report-abuse/page.tsx',
  'app/(glass)/feedback/[id]/page.tsx',
  'app/(glass)/verify-email/page.tsx',
  'components/ResetClient.tsx',
  'components/MfaClient.tsx',
];

describe('the Deep ocean top band (owner, 2026-11-14)', () => {
  it('every public page opens with the one shared TopBand, which holds its only h1', () => {
    for (const f of WITH_BAND) {
      const s = read(f);
      expect(s, f).toMatch(/from '@\/components\/glass\/TopBand'|from '\.\/glass\/TopBand'/);
      expect(s, f).toMatch(/<TopBand[\s>]/);
      expect((s.match(/<h1[\s>]/g) ?? []).length, `${f} has its own <h1> beside the band's`).toBe(0);
    }
  });

  it('no dashboard uses it, and there is no second copy of the band', () => {
    const dash = walk('app/(dash)').filter((f) => /<TopBand[\s>]/.test(read(f)));
    expect(dash).toEqual([]);
    const copies = [...walk('components'), ...walk('app')].filter((f) => /className=["'`]sob-band["'` ]/.test(read(f)) && !f.endsWith(path.join('glass', 'TopBand.tsx')));
    expect(copies).toEqual([]);
  });

  it('the band is CSS only: no blur filter, glows drift on transform and stop for reduced motion', () => {
    const css = read('app/sob-parts.css');
    const block = css.slice(css.indexOf('"Deep ocean" top band'));
    expect(block).toMatch(/linear-gradient\(150deg, #0e2a44 0%, #123e5c 40%, #0f5a5a 100%\)/);
    expect(block).not.toMatch(/filter:\s*blur/);
    expect(block).toMatch(/@keyframes sob-band-drift1[\s\S]*?transform:/);
    expect(block).toMatch(/prefers-reduced-motion: reduce[\s\S]*?sob-band-g1[\s\S]*?animation: none/);
    expect(read('components/glass/TopBand.tsx')).not.toMatch(/use client|useEffect|addEventListener/);
  });

  it('the home hero has no floating cards any more (markup, styles and their data)', () => {
    expect(read('app/(glass)/page.tsx')).not.toMatch(/floater|\[f1, f2\]/);
    for (const f of ['app/sob.css', 'app/sob-extra.css', 'app/sob-parts.css']) expect(read(f), f).not.toMatch(/\.floater\b/);
  });
});
