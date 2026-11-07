import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOOTER_COLUMNS, PUBLIC_LINKS, ROLE_MENUS } from '@/lib/glass/nav';

/*
 * The rules of the glass UI (SELLONBAY_REDESIGN.md), kept by a test because old and new pages share one site until the redesign is finished.
 */
const root = path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const css = read('app/glass.css').replace(/\/\*[\s\S]*?\*\//g, '');
const dir = path.join(root, 'components', 'glass');
const components = fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')] as const);

/* Every selector in the file, keyframe steps left out. */
const selectors = () => {
  const noFrames = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  return [...noFrames.matchAll(/([^{}]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => !s.startsWith('@'))
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
};

describe('glass UI', () => {
  it('cannot touch a page on the old look: every selector uses a g- class', () => {
    const list = selectors();
    expect(list.length).toBeGreaterThan(50);
    expect(list.filter((s) => !/\.g-[a-z]/.test(s))).toEqual([]);
  });

  it('uses the colours of the design system', () => {
    for (const c of ['#edf3f6', '#2b4250', '#566c78', '#cdebdf', '#1a5444', '#5fa88f', '#e2f3ec', '#fbefd9', '#f6e3e0', '#ddeaf6']) expect(css).toContain(c);
    expect(css).toContain('rgba(255, 255, 255, 0.6)');
    expect(css).toContain('blur(18px)');
  });

  it('turns off every animation with reduced motion, and reveals on scroll only where the browser can', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important[\s\S]*transition: none !important/);
    expect(css).toMatch(/@supports \(animation-timeline: view\(\)\)\s*\{\s*\.g-reveal/);
    expect(css.match(/animation-timeline/g)?.length).toBe(2); // the @supports test and the rule inside it
  });

  it('never blurs a table row, and the scroll reveal has no blur', () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);
    expect(rules.filter(([s, b]) => /backdrop-filter/.test(b) && /(tr|td|table|g-li)\b/.test(s))).toEqual([]);
    const reveal = css.match(/@keyframes g-reveal\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)?.[0] ?? '';
    expect(reveal).not.toContain('filter');
  });

  it('keeps grid columns from pushing past a phone', () => {
    expect(css).not.toMatch(/minmax\(\d+px,/);
    expect(css).not.toMatch(/[^(,\s]\s*1fr\)?;?\s*\n?\s*grid-template-columns: 1fr/);
  });

  it('adds no animation library and no JavaScript motion', () => {
    for (const [f, src] of components) {
      expect(src, f).not.toMatch(/from ['"](three|framer-motion|motion|gsap)/);
      expect(src, f).not.toMatch(/requestAnimationFrame|addEventListener\(['"]scroll/);
    }
  });

  it('does not use the banned word, an SMS or language control, or a claim we cannot keep', () => {
    const sources = [...components.map(([, s]) => s), read('lib/glass/nav.ts'), read('app/(glass)/design-preview/page.tsx')].join('\n');
    expect(sources).not.toMatch(/template/i);
    expect(sources).not.toMatch(/\bSMS\b|বাংলা|within minutes|privacy included|auto-connect/i);
  });

  it('has the menus of the design: 5 public links, 4 footer columns, 7 buyer, 9 seller and 11 admin pages', () => {
    expect(PUBLIC_LINKS.map((l) => l.label)).toEqual(['Websites', 'Domains', 'Sellers', 'Sell', 'Help']);
    expect(FOOTER_COLUMNS.map((c) => c.title)).toEqual(['Marketplace', 'Sell', 'Help', 'Legal']);
    const count = (r: keyof typeof ROLE_MENUS) => ROLE_MENUS[r].groups.flatMap((g) => g.items).length;
    expect([count('buyer'), count('seller'), count('admin')]).toEqual([7, 9, 11]);
  });

  it('gives every item in a menu its own key and address', () => {
    for (const m of Object.values(ROLE_MENUS)) {
      const items = m.groups.flatMap((g) => g.items);
      expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
      expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    }
  });

  it('keeps the preview out of production', () => {
    const page = read('app/(glass)/design-preview/page.tsx');
    expect(page).toMatch(/process\.env\.NODE_ENV === 'production'\) notFound\(\)/);
    expect(page).toMatch(/robots: \{ index: false/);
  });
});
