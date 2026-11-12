import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOOTER_COLUMNS, PUBLIC_LINKS, ROLE_MENUS } from '@/lib/glass/nav';

/*
 * The rules of the glass UI (SELLONBAY_REDESIGN.md), kept by a test because old and new pages share one site until the redesign is finished.
 */
const root = path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
// The design's stylesheets: app/sob.css is generated from design-reference/; sob-extra and sob-parts hold what the design does not draw.
const css = ['app/sob.css', 'app/sob-extra.css', 'app/sob-parts.css']
  .map(read)
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');
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
  it('cannot touch a page outside the design: every selector sits under a design root', () => {
    // whole selector lists: a comma inside :is() does not split a rule
    const rules = [...css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((x) => x && !x.startsWith('@'));
    expect(rules.length).toBeGreaterThan(500);
    expect(rules.filter((x) => !/\.sob-/.test(x))).toEqual([]);
  });

  it('uses the colours of the design system', () => {
    for (const c of ['#edf3f6', '#2b4250', '#566c78', '#cdebdf', '#1a5444', '#5fa88f', '#e2f3ec', '#fbefd9', '#f6e3e0', '#ddeaf6']) expect(css.toLowerCase()).toContain(c);
    expect(css).toContain('blur(18px)');
  });

  it('keeps the design motion: reduced motion, the scroll reveal only where the browser can, and no old keyframes', () => {
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).toContain('animation-timeline');
    const frames = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
    expect(frames.length).toBeGreaterThan(20);
    expect(frames.filter((n) => !n.startsWith('sob-'))).toEqual([]);
  });

  it('never blurs a table row, and the scroll reveal has no blur', () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);
    expect(rules.filter(([s, b]) => /backdrop-filter/.test(b) && /\b(tr|td)\b/.test(s))).toEqual([]);
    const reveal = css.match(/@keyframes sob-reveal\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)?.[0] ?? '';
    expect(reveal).not.toContain('filter');
  });

  it('has no old stylesheet left', () => {
    expect(fs.existsSync(path.join(root, 'app', 'glass.css'))).toBe(false);
    const globals = read('app/globals.css');
    expect(globals).not.toMatch(/@keyframes/);
    expect(globals.length).toBeLessThan(2000);
  });

  it('adds no animation library and no JavaScript motion', () => {
    for (const [f, src] of components) {
      expect(src, f).not.toMatch(/from ['"](three|framer-motion|motion|gsap)/);
      expect(src, f).not.toMatch(/requestAnimationFrame|addEventListener\(['"]scroll/);
    }
  });

  it('does not use the banned word, an SMS or language control, or a claim we cannot keep', () => {
    // gridTemplateColumns is a CSS property of the ported design, not the word.
    const sources = [...components.map(([, s]) => s), read('lib/glass/nav.ts')].join('\n').replace(/gridTemplate\w*/g, '');
    expect(sources).not.toMatch(/template/i);
    expect(sources).not.toMatch(/\bSMS\b|বাংলা|within minutes|privacy included|auto-connect/i);
  });

  it('has the menus of the design: 5 public links, 4 footer columns, 8 buyer, 9 seller and 16 admin pages (the design pages, plus Visitors, Server health, Guides and Pages, owner 2026-11-08, and buyer subscriptions, owner 2026-11-12)', () => {
    expect(PUBLIC_LINKS.map((l) => l.label)).toEqual(['Websites', 'Domains', 'Sellers', 'Sell', 'Help']);
    expect(FOOTER_COLUMNS.map((c) => c.title)).toEqual(['Marketplace', 'Sell', 'Help', 'Legal']); // plus the Contact column from lib/emailRouting.ts
    const count = (r: keyof typeof ROLE_MENUS) => ROLE_MENUS[r].groups.flatMap((g) => g.items).length;
    expect([count('buyer'), count('seller'), count('admin')]).toEqual([9, 10, 17]);
  });

  it('gives every item in a menu its own key and address', () => {
    for (const m of Object.values(ROLE_MENUS)) {
      const items = m.groups.flatMap((g) => g.items);
      expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
      expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    }
  });

  it('the design preview page is gone (removed in Phase 7, owner 2026-11-08)', () => {
    expect(() => read('app/(glass)/design-preview/page.tsx')).toThrow();
  });
});
