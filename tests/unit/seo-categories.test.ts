import { describe, expect, it } from 'vitest';
import { DIGITAL_CATS } from '@/lib/apps';
import { CATS } from '@/lib/data';
import { CATEGORIES, MIN_PRODUCTS, categoryFor } from '@/lib/seo/categories';
import { categoryPages, productsIn } from '@/lib/seo/pages';
import { similarity } from '@/lib/similarity';

describe('category page copy', () => {
  it('covers every website and digital category the catalogue has, once each', () => {
    const sites = CATEGORIES.filter((c) => c.group === 'websites').map((c) => c.name);
    const digital = CATEGORIES.filter((c) => c.group === 'templates').map((c) => c.name);
    expect(sites.sort()).toEqual(CATS.filter((c) => c !== 'All').sort());
    expect(digital.sort()).toEqual([...DIGITAL_CATS].sort());
    expect(new Set(CATEGORIES.map((c) => `${c.group}/${c.slug}`)).size).toBe(CATEGORIES.length);
    expect(new Set(CATEGORIES.map((c) => c.title)).size).toBe(CATEGORIES.length);
  });
  it('each page has real, searchable content: a title, a short description, two paragraphs, things to look for, three questions', () => {
    for (const c of CATEGORIES) {
      expect(c.title.length, c.slug).toBeGreaterThan(15);
      expect(c.title.length, c.slug).toBeLessThanOrEqual(70);
      expect(c.description.length, c.slug).toBeGreaterThan(80);
      expect(c.description.length, c.slug).toBeLessThanOrEqual(170);
      expect(c.intro.length, c.slug).toBeGreaterThanOrEqual(2);
      expect(c.intro.join(' ').length, c.slug).toBeGreaterThan(300);
      expect(c.lookFor.length, c.slug).toBeGreaterThanOrEqual(4);
      expect(c.faq.length, c.slug).toBeGreaterThanOrEqual(3);
      expect(c.slug, c.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
  it('no two pages share their text: it is written per category, not a template with a word changed', () => {
    for (let i = 0; i < CATEGORIES.length; i++)
      for (let j = i + 1; j < CATEGORIES.length; j++) {
        const a = CATEGORIES[i],
          b = CATEGORIES[j];
        expect(similarity(a.intro.join(' '), b.intro.join(' ')), `${a.slug} vs ${b.slug} intro`).toBeLessThan(0.15);
        expect(similarity(a.faq.map((f) => f.join(' ')).join(' '), b.faq.map((f) => f.join(' ')).join(' ')), `${a.slug} vs ${b.slug} faq`).toBeLessThan(0.15);
      }
  });
  it('no promise that cannot be kept: no "guaranteed", "best", "#1" and no price quotes of third parties', () => {
    for (const c of CATEGORIES) expect(JSON.stringify(c), c.slug).not.toMatch(/guarantee[sd]?\b|\bbest in\b|#1|\$\d/i);
  });
  it('finds a category by group and slug, not across groups', () => {
    expect(categoryFor('websites', 'restaurants')?.name).toBe('Restaurants');
    expect(categoryFor('templates', 'figma-ui-kits')?.name).toBe('Figma kits');
    expect(categoryFor('websites', 'figma-ui-kits')).toBeUndefined();
    expect(categoryFor('websites', 'nope')).toBeUndefined();
  });
});

describe('which pages exist', () => {
  it('only categories with at least three real products', async () => {
    expect(MIN_PRODUCTS).toBe(3);
    const pages = await categoryPages();
    for (const p of pages) expect(p.count).toBeGreaterThanOrEqual(3);
    const slugs = pages.map((p) => `${p.copy.group}/${p.copy.slug}`);
    expect(slugs).toEqual(expect.arrayContaining(['websites/landing-pages', 'websites/tools']));
    expect(slugs).not.toContain('websites/restaurants'); // one starter site today
    const restaurants = await productsIn(categoryFor('websites', 'restaurants')!);
    expect(restaurants.length).toBeLessThan(3);
    for (const p of await productsIn(categoryFor('websites', 'tools')!)) expect(p.cat).toBe('Tools');
  });
});
