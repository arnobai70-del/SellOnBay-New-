import { describe, expect, it } from 'vitest';
import { MARKET_MENU } from '@/lib/marketMenu';
import { applyNav, cleanNav, NAV_DEFAULT } from '@/lib/navConfig';
import { applyControls } from '@/lib/seo/applyControls';
import { closedProducts } from '@/lib/seo/closed';
import { cleanControls, controlsProblem, DEFAULT_CONTROLS, faqJsonLd, keywordIdeas, pageJsonLd } from '@/lib/seo/controls';
import { setPageControls } from '@/lib/seo/controlStore';
import { navConfig, navMenu, setNavConfig } from '@/lib/seo/navStore';
import { addRedirect, listRedirects, removeRedirect } from '@/lib/seo/redirectStore';
import { cleanRedirects, redirectFor, redirectProblem } from '@/lib/seo/redirectsCore';
import { slugProblem } from '@/lib/seo/slug';
import { seoWarnings } from '@/lib/seo/warnings';

const C = DEFAULT_CONTROLS;

describe('the top bar choices', () => {
  const keys = MARKET_MENU.map((e) => e.key);
  it('hide and reorder entries, but never Help and never an unknown key', () => {
    const cfg = cleanNav({ hidden: ['saas', 'ecommerce', 'nope'], order: ['industry', 'business', 'nope', 'business'] }, keys);
    expect(cfg.hidden).toEqual(['saas']); // the home page entry is never hidden
    expect(cfg.order).toEqual(['industry', 'business']);
    const menu = applyNav(MARKET_MENU, cfg);
    expect(menu.map((e) => e.key)).not.toContain('saas');
    expect(menu.map((e) => e.key).slice(0, 2)).toEqual(['industry', 'business']);
    expect(menu.map((e) => e.key)).toContain('ecommerce');
    expect(applyNav(MARKET_MENU, NAV_DEFAULT).map((e) => e.key)).toEqual(keys); // nothing saved = the menu as before
  });
  it('save, apply and audit', async () => {
    expect(await setNavConfig('admin-1', { hidden: ['portfolio'], order: ['ecommerce'] })).toEqual({ ok: true });
    expect((await navConfig(0)).hidden).toEqual(['portfolio']);
    expect((await navMenu()).map((e) => e.key)).not.toContain('portfolio');
    expect(await setNavConfig('admin-1', { hidden: ['portfolio'], order: ['ecommerce'] })).toMatchObject({ ok: false, status: 409 });
    expect(await setNavConfig('admin-1', { hidden: ['bogus'], order: [] })).toMatchObject({ ok: false, status: 400 });
    expect(await setNavConfig('admin-1', { hidden: [], order: [] })).toEqual({ ok: true });
  });
});

describe('redirects', () => {
  it('refuse the working parts of the site, live pages, loops and bad addresses', () => {
    const r = (from: string, to: string) => ({ from, to, code: 301 as const });
    expect(redirectProblem([], r('/old', '/new'))).toBeNull();
    expect(redirectProblem([], r('/dashboard/admin', '/new'))).toBeTruthy();
    expect(redirectProblem([], r('/checkout', '/new'))).toBeTruthy();
    expect(redirectProblem([], r('/api/x', '/new'))).toBeTruthy();
    expect(redirectProblem([], r('/', '/new'))).toBeTruthy();
    expect(redirectProblem([], r('/faq', '/new'), ['/faq'])).toBeTruthy();
    expect(redirectProblem([], r('/old', '/old'))).toBeTruthy();
    expect(redirectProblem([], r('/old', 'javascript:alert(1)'))).toBeTruthy();
    expect(redirectProblem([], r('/old', 'http://x.test'))).toBeTruthy();
    expect(redirectProblem([r('/b', '/a')], r('/a', '/b'))).toMatch(/loop/);
  });
  it('look up one hop, ignoring a query and a trailing slash, and drop bad stored rules', () => {
    const list = cleanRedirects([
      { from: '/old/', to: '/new', code: 301 },
      { from: '/dashboard', to: '/x', code: 301 },
      { from: 5, to: '/x' },
    ]);
    expect(list).toEqual([{ from: '/old', to: '/new', code: 301 }]);
    expect(redirectFor(list, '/old/')?.to).toBe('/new');
    expect(redirectFor(list, '/other')).toBeNull();
  });
  it('save, replace and remove with an audit trail', async () => {
    expect(await addRedirect('admin-1', { from: '/old-page', to: '/browse', code: 301 })).toEqual({ ok: true });
    expect((await listRedirects()).some((r) => r.from === '/old-page')).toBe(true);
    expect(await addRedirect('admin-1', { from: '/old-page', to: '/browse', code: 301 })).toMatchObject({ ok: false, status: 409 });
    expect(await addRedirect('admin-1', { from: '/faq', to: '/browse', code: 301 })).toMatchObject({ ok: false, status: 400 }); // a live page
    expect(await removeRedirect('admin-1', '/old-page')).toEqual({ ok: true });
    expect(await removeRedirect('admin-1', '/old-page')).toMatchObject({ ok: false, status: 404 });
  });
  it('check a new listing address', () => {
    expect(slugProblem('my-new-shop')).toBeNull();
    for (const bad of ['Ab', 'has space', 'UPPER', 'a--b', 'ends-', '../x']) expect(slugProblem(bad), bad).toBeTruthy();
  });
});

describe('page settings that reach the visitor', () => {
  it('lay the share card, canonical and robots over a page and leave an untouched page alone', () => {
    const base = { title: 'T', description: 'D' };
    expect(applyControls('/faq', base, C)).toEqual(base);
    const m = applyControls('/faq', base, { ...C, ogImage: '/og.png', ogImageAlt: 'A shop', ogTitle: 'Share', canonical: 'https://sellonbay.com/faq', index: false });
    expect(m.alternates?.canonical).toBe('https://sellonbay.com/faq');
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.openGraph).toMatchObject({ title: 'Share', images: [{ url: '/og.png', alt: 'A shop' }] });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image' });
  });
  it('write structured data only from real saved content, and only when switched on', () => {
    expect(faqJsonLd({ ...C, faqSchema: false, faqs: [{ q: 'Q?', a: 'A.' }] })).toBeNull();
    expect(faqJsonLd({ ...C, faqs: [{ q: 'Q?', a: 'A.', draft: true }] })).toBeNull();
    expect(pageJsonLd({ ...C, schema: false }, { url: 'https://x.test/a', name: 'A' })).toBeNull();
    const ld = pageJsonLd({ ...C, ogImage: 'https://x.test/i.png', ogImageAlt: 'Shop' }, { url: 'https://x.test/a', name: 'A', description: 'D', collection: true, image: 'https://x.test/i.png' })!;
    expect(ld['@type']).toBe('CollectionPage');
    expect(ld.primaryImageOfPage).toMatchObject({ url: 'https://x.test/i.png', caption: 'Shop' });
  });
  it('limit the new fields and keep text as plain Markdown', () => {
    expect(controlsProblem({ ...C, related: Array.from({ length: 9 }, (_, i) => `p${i}`) })).toBeTruthy();
    expect(controlsProblem({ ...C, related: ['bad id!'] })).toBeTruthy();
    expect(controlsProblem({ ...C, ogImageAlt: 'x'.repeat(141) })).toBeTruthy();
    expect(controlsProblem({ ...C, content: 'x'.repeat(20_001) })).toBeTruthy();
    expect(cleanControls({ content: ' a\r\nb ', related: ['p1', 5] })).toMatchObject({ content: 'a\nb', related: ['p1'] });
  });
  it('suggest keyword ideas from a page’s own words, without filler', () => {
    const ideas = keywordIdeas('Ready-made restaurant websites. Restaurant websites with menu and booking. Pick restaurant websites and the booking form.');
    expect(ideas).toContain('restaurant websites');
    expect(ideas.every((k) => !/^(and|the|with) /.test(k))).toBe(true);
  });
  it('only change settings for a page or listing that exists, so a typo never hides something', async () => {
    expect(await setPageControls('admin-1', '/product/no-such-listing', { ...C, status: 'archived' })).toMatchObject({ ok: false, status: 404 });
    expect((await closedProducts(0)).size).toBe(0);
    expect(await setPageControls('admin-1', '/', { ...C, status: 'archived' })).toMatchObject({ ok: false, status: 400 }); // the home page is never closed
  });
});

describe('warnings', () => {
  it('count repeats and missing pictures across pages', () => {
    const controls = { '/a': { ...C, canonical: 'https://x.test/z', ogImage: '/i.png' }, '/b': { ...C, canonical: 'https://x.test/z' } };
    const seo = { '/a': { title: 'Same', description: 'One' }, '/b': { title: 'same', description: 'Two' } };
    const w = seoWarnings(['/a', '/b', '/c'], controls, seo);
    expect(w.duplicateCanonical).toEqual([{ value: 'https://x.test/z', paths: ['/a', '/b'] }]);
    expect(w.duplicateTitle[0].paths).toEqual(['/a', '/b']);
    expect(w.duplicateDescription).toEqual([]);
    expect(w.noPicture).toEqual(['/b', '/c']);
  });
});
