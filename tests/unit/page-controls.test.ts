import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { cleanControls, controlsProblem, DEFAULT_CONTROLS, faqJsonLd, inSitemap, isPublic, robotsFor } from '@/lib/seo/controls';
import { pageControls, setPageControls } from '@/lib/seo/controlStore';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { sitemapCounts, sitemapPlan } from '@/lib/seo/sitemapPlan';

const C = DEFAULT_CONTROLS;

// These checks use the older, larger sitemap (every published page), which a test server with the old public site builds.
beforeAll(() => vi.stubEnv('NEXT_PUBLIC_LEGACY_PUBLIC', '1'));
afterAll(() => vi.unstubAllEnvs());

describe('page publishing and search controls', () => {
  it('keeps every page as it was until something is saved', () => {
    expect(isPublic('/faq', C)).toBe(true);
    expect(inSitemap('/faq', C)).toBe(true);
    expect(robotsFor('/faq', C)).toBeUndefined();
  });

  it('closes draft and archived marketing pages but never legal ones', () => {
    for (const status of ['draft', 'archived'] as const) {
      expect(isPublic('/faq', { ...C, status })).toBe(false);
      expect(inSitemap('/faq', { ...C, status })).toBe(false);
      expect(robotsFor('/faq', { ...C, status })).toMatchObject({ index: false });
      expect(isPublic('/terms', { ...C, status })).toBe(true);
    }
  });

  it('keeps publishing and indexing apart', () => {
    expect(inSitemap('/faq', { ...C, index: false })).toBe(false);
    expect(inSitemap('/faq', { ...C, sitemap: false })).toBe(false);
    expect(robotsFor('/faq', { ...C, index: false })).toEqual({ index: false, follow: true });
    expect(robotsFor('/faq', { ...C, follow: false })).toEqual({ index: true, follow: false });
  });

  it('refuses bad input and falls back to defaults on a bad stored value', () => {
    expect(controlsProblem({ ...C, canonical: 'javascript:alert(1)' })).toBeTruthy();
    expect(controlsProblem({ ...C, ogImage: 'http://x.test/a.png' })).toBeTruthy();
    expect(controlsProblem({ ...C, faqs: [{ q: 'Why?', a: '' }] })).toBeTruthy();
    expect(controlsProblem({ ...C, ogTitle: '<b>x</b>' })).toBeTruthy();
    expect(cleanControls({ status: 'draft', canonical: 'javascript:x' })).toEqual(C);
    expect(cleanControls(null)).toEqual(C);
  });

  it('builds FAQ structured data only from published questions', () => {
    expect(faqJsonLd(C)).toBeNull();
    const c = {
      ...C,
      faqs: [
        { q: 'Refunds?', a: 'After a dispute.' },
        { q: 'Hidden?', a: 'Draft.', draft: true },
      ],
    };
    const ld = faqJsonLd(c)!;
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(1);
  });

  it('saves, applies to metadata and the sitemap, audits, and restores', async () => {
    const base = (await sitemapPlan()).length;
    expect((await sitemapPlan()).some((e) => e.path === '/find')).toBe(true);

    expect(await setPageControls('admin-1', '/find', { ...C, status: 'archived' })).toEqual({ ok: true });
    await expect(pageMetadata('/find')).rejects.toThrow(); // a real 404, not a hidden page
    expect((await sitemapPlan()).some((e) => e.path === '/find')).toBe(false);
    expect((await sitemapPlan()).length).toBe(base - 1);
    expect((await auditList(20)).some((e) => e.action === 'seo_controls_changed' && e.targetRef === '/find')).toBe(true);

    expect(await setPageControls('admin-1', '/find', { ...C, canonical: 'https://sellonbay.com/find', ogImage: '/og/find.png', index: false })).toEqual({ ok: true });
    const m = await pageMetadata('/find');
    expect(m.alternates?.canonical).toBe('https://sellonbay.com/find');
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.openGraph).toMatchObject({ images: ['/og/find.png'] });
    expect((await sitemapPlan()).some((e) => e.path === '/find')).toBe(false);

    expect(await setPageControls('admin-1', '/find', C)).toEqual({ ok: true });
    expect(await pageControls('/find')).toEqual(C);
    expect((await sitemapPlan()).some((e) => e.path === '/find')).toBe(true);
  });

  it('will not close a legal page or an unknown page, and says when nothing changed', async () => {
    expect(await setPageControls('admin-1', '/terms', { ...C, status: 'archived' })).toMatchObject({ ok: false, status: 400 });
    expect(await setPageControls('admin-1', '/nope', C)).toMatchObject({ ok: false, status: 404 });
    expect(await setPageControls('admin-1', '/faq', C)).toMatchObject({ ok: false, status: 409 });
  });

  it('counts commercial and other pages apart and lists the home page and legal pages, with no ceiling', async () => {
    const plan = await sitemapPlan();
    const n = sitemapCounts(plan);
    expect(n.total).toBe(n.primary + n.additional);
    expect(plan.some((e) => e.kind === 'home')).toBe(true);
    for (const p of ['/privacy', '/terms', '/refunds']) expect(plan.some((e) => e.path === p)).toBe(true);
    for (const e of plan) expect(e.url).toMatch(/^https?:\/\//);
    expect(plan.some((e) => /\/(checkout|dashboard|orders|pay|login|account|api)/.test(e.path))).toBe(false);
  });
});

describe('pages that show what an admin saved', () => {
  it('has PageExtras on every listed page, so questions, text and related listings show wherever they can be edited', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { SEO_PAGES } = await import('@/lib/seo/pageList');
    for (const p of SEO_PAGES) {
      const path = p.path.split('?')[0];
      const file =
        path === '/'
          ? 'app/(site)/page.tsx'
          : path.startsWith('/apps/')
            ? 'app/(site)/apps/[platform]/page.tsx'
            : path.startsWith('/templates/')
              ? 'app/(site)/templates/[category]/page.tsx'
              : `app/(site)${path}/page.tsx`;
      expect(existsSync(file), p.path).toBe(true);
      const text = readFileSync(file, 'utf8');
      // Legal pages get it from LegalPage.
      const ok = text.includes('<PageExtras') || (text.includes('<LegalPage') && readFileSync('components/LegalPage.tsx', 'utf8').includes('<PageExtras'));
      expect(ok, p.path).toBe(true);
    }
  });
});
