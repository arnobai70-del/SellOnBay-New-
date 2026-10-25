import { describe, expect, it } from 'vitest';
import { seoFindings, type SeoRow } from '@/lib/seo/check';
import { SEO_PAGES } from '@/lib/seo/pageList';
import { autoListingMeta } from '@/lib/seo/listingMeta';
import { PRODUCTS } from '@/lib/data';

const row = (path: string, title: string, description: string): SeoRow => ({ path, name: path, kind: 'page', title, description, changed: false });

describe('the automatic SEO check', () => {
  it('flags missing, long, short and duplicate words, and passes good ones', () => {
    const good = 'Ready-made restaurant websites with menus and booking, live on your own domain and paid into escrow until you accept.';
    const f = seoFindings([
      row('/a', 'Restaurant websites · SellOnBay', good),
      row('/b', '', ''),
      row('/c', 'x'.repeat(80), 'Too short.'),
      row('/d', 'Same title here', 'One description that is long enough to pass the length check without any trouble at all.'),
      row('/e', 'Same title here', 'Another description that is long enough to pass the length check without any trouble.'),
    ]);
    expect(f.get('/a')).toEqual([]);
    expect(f.get('/b')!.map((x) => x.level)).toEqual(['fix', 'fix']);
    expect(
      f
        .get('/c')!
        .map((x) => x.text)
        .join(' '),
    ).toMatch(/80 characters.*short/);
    expect(f.get('/d')!.some((x) => /same title/.test(x.text))).toBe(true);
  });

  it('gives every listed page its own title and a description of a good length', () => {
    for (const p of SEO_PAGES) {
      expect(p.description.length, p.path).toBeGreaterThanOrEqual(50);
      expect(p.description.length, p.path).toBeLessThanOrEqual(170);
    }
    const titles = SEO_PAGES.map((p) => p.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('builds a listing’s words from the listing itself, within what Google shows', () => {
    for (const p of PRODUCTS) {
      const m = autoListingMeta(p);
      expect(m.title).toContain(p.name.slice(0, 10));
      expect(m.description.length).toBeGreaterThanOrEqual(50);
      expect(m.description.length).toBeLessThanOrEqual(160);
    }
  });
});
