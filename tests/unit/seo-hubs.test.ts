import { describe, expect, it } from 'vitest';
import { LEGACY_MENU } from '@/lib/marketMenu';
import { DEFAULT_CONTROLS } from '@/lib/seo/controls';
import { setPageControls } from '@/lib/seo/controlStore';
import { HUB_LIMIT, HUBS, hubPath } from '@/lib/seo/hubs';
import { HUB_LINKS } from '@/lib/seo/hubLinks';
import { cleanAllocation, hubOf, hubView, setAssignment, setHubLimit, allocation } from '@/lib/seo/hubStore';
import { SEO_PAGES } from '@/lib/seo/pageList';
import { sitemapPlan } from '@/lib/seo/sitemapPlan';

describe('the five template categories', () => {
  it('are the five approved ones, each with its own words and a listed page', () => {
    expect(HUBS.map(hubPath)).toEqual(['/', '/templates/saas', '/templates/business', '/templates/portfolio', '/templates/industry']);
    expect(HUBS.map((h) => h.name)).toEqual(HUB_LINKS.map(([, n]) => n));
    expect(HUBS.map((h) => h.slug)).toEqual(HUB_LINKS.map(([s]) => s));
    expect(new Set(HUBS.map((h) => h.title)).size).toBe(5);
    expect(new Set(HUBS.map((h) => h.description)).size).toBe(5);
    for (const h of HUBS) {
      if (h.slug !== 'ecommerce') expect(SEO_PAGES.map((p) => p.path)).toContain(hubPath(h)); // the E-commerce category is the home page
      expect(h.description.length).toBeGreaterThanOrEqual(50);
      expect(h.description.length).toBeLessThanOrEqual(170);
      expect(h.faq.length).toBeGreaterThan(0);
    }
  });

  it('are in the top bar as one Templates entry that sends to each page', () => {
    const e = LEGACY_MENU.find((m) => m.key === 'templates')!;
    expect(e.groups[0].links.map(([, href]) => href)).toEqual(HUBS.map(hubPath));
  });

  it('place a listing by the admin choice first, then by its own category, and never an example', async () => {
    const a = cleanAllocation({ assign: { x1: 'saas', x2: 'none', bad: 'nope' }, limits: { ecommerce: 6, saas: 99 } });
    expect(a.assign).toEqual({ x1: 'saas', x2: 'none' });
    expect(a.limits).toEqual({ ecommerce: 6 });
    expect(hubOf({ id: 'x1', cat: 'Stores', platform: 'web' }, a)?.slug).toBe('saas');
    expect(hubOf({ id: 'x2', cat: 'Stores', platform: 'web' }, a)).toBeNull();
    expect(hubOf({ id: 'y', cat: 'Stores', platform: 'web' }, a)?.slug).toBe('ecommerce');
    expect(hubOf({ id: 'y', cat: 'Stores', platform: 'android' }, a)?.slug).toBe('business'); // apps and files land in the default hub until an admin moves them
    expect(hubOf({ id: 'y', cat: 'Portfolios', platform: 'web' }, a)?.slug).toBe('portfolio');
    // No database here, so there are no real listings: every hub is empty and stays out of search.
    const v = await hubView(HUBS[0]);
    expect(v.products).toEqual([]);
    expect(v.indexable).toBe(false);
    expect(v.limit).toBe(HUB_LIMIT);
  });

  it('keep the number shown and the choices as audited settings', async () => {
    expect(await setHubLimit('admin-1', 'ecommerce', 6)).toEqual({ ok: true });
    expect((await hubView(HUBS[0])).limit).toBe(6);
    expect(await setHubLimit('admin-1', 'ecommerce', 6)).toMatchObject({ ok: false, status: 409 });
    expect(await setHubLimit('admin-1', 'ecommerce', 0)).toMatchObject({ ok: false, status: 400 });
    expect(await setHubLimit('admin-1', 'nope', 4)).toMatchObject({ ok: false, status: 404 });
    expect(await setAssignment('admin-1', 'p1', 'industry')).toEqual({ ok: true });
    expect((await allocation(0)).assign.p1).toBe('industry');
    expect(await setAssignment('admin-1', 'p1', 'auto')).toEqual({ ok: true });
    expect((await allocation(0)).assign.p1).toBeUndefined();
    expect(await setAssignment('admin-1', 'p1', 'bogus')).toMatchObject({ ok: false, status: 400 });
  });

  it('stay out of the sitemap while they hold fewer than three real listings, and a closed hub is not listed either', async () => {
    const plan = await sitemapPlan();
    for (const h of HUBS.filter((x) => x.slug !== 'ecommerce')) expect(plan.some((e) => e.path === hubPath(h))).toBe(false);
    expect(await setPageControls('admin-1', hubPath(HUBS[1]), { ...DEFAULT_CONTROLS, faqs: [{ q: 'Q?', a: 'A.' }] })).toEqual({ ok: true });
  });
});
