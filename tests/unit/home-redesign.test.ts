import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The cinematic home page (October 2026) is a change of markup, CSS and motion only. These guards keep its rules: the same h1, the same words and
 * links, nothing hidden unless JS runs and motion is welcome, a decorative clip that never autoplays from the HTML, and no animation libraries.
 */
const page = readFileSync('app/(site)/page.tsx', 'utf8');
const css = readFileSync('app/home.css', 'utf8');
const video = readFileSync('components/home/HeroVideo.tsx', 'utf8');
const layout = readFileSync('app/layout.tsx', 'utf8');

// Innermost CSS rules as [selector, declarations], with @keyframes steps left out.
const rules = (src: string) =>
  [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const).filter(([sel]) => !/^(from|to|[\d.,%\s]+)$/.test(sel));

describe('cinematic home page', () => {
  it('keeps exactly one h1 with the same words', () => {
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).toContain("'Website templates, ready to make yours'");
    expect(page).toContain("'Websites, apps and digital products, ready to use'");
  });

  it('keeps the same words for the hero, steps and seller band, from the same sources', () => {
    for (const s of [
      'Built once by real developers and made yours: your name, your domain, your brand. Look at the real thing before you pay.',
      'Payment held in escrow until you accept',
      'Find a site, app or file and look at the live demo.',
      'Your money is held. The seller cannot touch it yet.',
      'Click through the live site or try the app first. What you see is what the seller delivers.',
      'Build once, sell it again and again',
    ])
      expect(page).toContain(s);
    expect(page).toContain('You keep {PLAN_KEEP_TEXT} of every sale, depending on your plan ({keep(CONFIG.plans.free.commissionBps)} on the');
    expect(page).not.toMatch(/78|data-n=/); // the prototype's placeholder figures
  });

  it('keeps the links: tabs to /?tab=, cards to the category product address, See all, Start selling', () => {
    expect(page).toContain("k === 'popular' ? '/' : `/?tab=${k}`");
    expect(page).toContain('hubProductPath(productHub.get(p.id) ?? ecom.hub, alloc, p.id)');
    expect(page).toContain('href={hubLinkHref(v.hub.slug)}');
    expect(page).toContain('href="/sell"');
    expect(page).not.toMatch(/href="#/); // no placeholder anchors from the prototype
  });

  it('hides nothing unless html.motion is set (decorative, aria-hidden pieces excepted)', () => {
    const decorative = /\.(hc-live|vh-video|cursor)\b/;
    const hidden = rules(css).filter(([sel, body]) => /opacity:\s*0(?![.\d])/.test(body) && !sel.split(',').every((s) => s.trim().startsWith('html.motion') || decorative.test(s)));
    expect(hidden).toEqual([]);
    // pinned stages and fixed scene heights are motion-only too
    const pinned = rules(css).filter(([sel, body]) => /position:\s*sticky|(?<![-\w])height:\s*\d+vh/.test(body) && !sel.startsWith('html.motion'));
    expect(pinned).toEqual([]);
  });

  it('the h1 and the line under it have no entrance: visible at first paint', () => {
    const hero = rules(css).filter(([sel, body]) => /\b(ln|hero-sub)\b|vhero h1/.test(sel) && /animation|opacity/.test(body));
    expect(hero).toEqual([]);
  });

  it('sets html.motion before paint, never with reduced motion', () => {
    expect(layout).toMatch(/<script id="motion-flag">\{'if\(!matchMedia\(`\(prefers-reduced-motion: reduce\)`\)\.matches\)document\.documentElement\.classList\.add\(`motion`\)'\}<\/script>/);
    expect(layout).not.toContain('GoogleAnalytics'); // GA stays in the (site) layout, untouched
  });

  it('the hero clip is decorative and never autoplays from the HTML', () => {
    expect(video).toMatch(/aria-hidden="true"/);
    expect(video).toMatch(/\bmuted\b/);
    expect(video).toMatch(/playsInline/);
    expect(video).not.toMatch(/autoPlay|\bsrc=/);
    expect(video).toMatch(/saveData/);
    expect(video).toMatch(/2g/);
    expect(video).toMatch(/prefers-reduced-motion/);
    // the poster is the LCP picture: preloaded (Next 16's name for priority), high priority, full width
    expect(page).toContain('<Image className="vh-poster" src={HERO_POSTER} alt="" fill sizes="100vw" preload fetchPriority="high" />');
    expect(page).toContain("'/media/hero-poster.webp'");
  });

  it('adds no animation library', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /framer-motion|^motion$|gsap|lenis|locomotive|swiper/.test(d))).toEqual([]);
  });
});
