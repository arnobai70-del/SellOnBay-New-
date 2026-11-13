import { readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bundled, englishCatalog, format, lookup, missingKeys, placeholderProblem, placeholders } from '@/lib/i18n/catalog';
import { BUILTIN, cleanLanguages, fromAcceptLanguage, isPublicPath, liveLanguages, localizedPath, PUBLIC_ROOTS, splitLocale } from '@/lib/i18n/config';
import { localizeFooter, localizeNav } from '@/lib/i18n/ui';
import { FOOTER_COLUMNS, PUBLIC_LINKS } from '@/lib/glass/nav';

vi.mock('server-only', () => ({}));
const hdr = { lang: 'en' };
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-sob-lang': hdr.lang }), cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const CODES = ['bn', 'ar', 'hi', 'es', 'fr', 'de', 'pt'];

describe('languages and addresses (owner, 2026-11-12)', () => {
  it('eight built-in languages; only English is live until an admin publishes another; Arabic is right to left', () => {
    expect(BUILTIN.map((l) => l.code)).toEqual(['en', ...CODES]);
    const s = cleanLanguages(null);
    expect(liveLanguages(s).map((l) => l.code)).toEqual(['en']);
    expect(s.languages.find((l) => l.code === 'ar')?.dir).toBe('rtl');
    expect(s.defaultLang).toBe('en');
  });
  it('cleans junk: English cannot be switched off, codes are unique, a default must be live, an added language is kept', () => {
    const s = cleanLanguages({
      defaultLang: 'bn',
      languages: [
        { code: 'en', enabled: false, published: false },
        { code: 'bn', enabled: true, published: false },
        { code: 'bn', name: 'dup' },
        { code: 'xx-yy-zz' },
        { code: 'it', name: 'Italian', native: 'Italiano', enabled: true, published: true },
      ],
    });
    expect(s.languages.find((l) => l.code === 'en')).toMatchObject({ enabled: true, published: true });
    expect(s.languages.filter((l) => l.code === 'bn')).toHaveLength(1);
    expect(s.defaultLang).toBe('en'); // bn is not published
    expect(liveLanguages(s).map((l) => l.code)).toEqual(['en', 'it']);
  });
  it('addresses: English keeps today’s, others get a prefix on public pages only', () => {
    expect(localizedPath('/websites/shop', 'bn')).toBe('/bn/websites/shop');
    expect(localizedPath('/', 'ar')).toBe('/ar');
    expect(localizedPath('/websites', 'en')).toBe('/websites');
    expect(localizedPath('/bn/websites', 'fr')).toBe('/fr/websites');
    expect(localizedPath('/bn/websites', 'en')).toBe('/websites');
    expect(localizedPath('/dashboard/buyer', 'bn')).toBe('/dashboard/buyer');
    expect(localizedPath('/api/search', 'bn')).toBe('/api/search');
    expect(splitLocale('/bn/help')).toEqual({ lang: 'bn', path: '/help' });
    expect(splitLocale('/bn')).toEqual({ lang: 'bn', path: '/' });
    expect(splitLocale('/websites')).toEqual({ lang: null, path: '/websites' });
    expect([isPublicPath('/'), isPublicPath('/legal/terms'), isPublicPath('/admin'), isPublicPath('/checkout')]).toEqual([true, true, false, false]);
  });
  it('every public page group in app/(glass) has a translated address, except the signed-in checkout', () => {
    const folders = readdirSync('app/(glass)', { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `/${d.name}`);
    expect(folders.filter((f) => !PUBLIC_ROOTS.includes(f) && f !== '/checkout')).toEqual([]);
  });
  it('browser language: a suggestion among live languages only', () => {
    expect(fromAcceptLanguage('bn-BD,bn;q=0.9,en;q=0.8', ['en', 'bn'])).toBe('bn');
    expect(fromAcceptLanguage('de-DE', ['en', 'bn'])).toBeNull();
    expect(fromAcceptLanguage(null, ['en'])).toBeNull();
  });
});

describe('the catalogue', () => {
  it('every bundled language has exactly the English words, none extra, none empty, the same placeholders', async () => {
    const en = englishCatalog();
    expect(Object.keys(en).length).toBeGreaterThan(150);
    for (const code of CODES) {
      const b = await bundled(code);
      expect(
        Object.keys(b).filter((k) => !(k in en)),
        `${code} extra`,
      ).toEqual([]);
      expect(missingKeys({}, b), `${code} missing`).toEqual([]);
      for (const k of Object.keys(en)) expect(placeholderProblem(en[k], b[k]), `${code} ${k}`).toBeNull();
    }
  });
  it('falls back: published edit, then the bundled draft, then English, never empty', () => {
    expect(lookup('nav.cart', { 'nav.cart': 'X' }, { 'nav.cart': 'Y' })).toBe('X');
    expect(lookup('nav.cart', { 'nav.cart': '  ' }, { 'nav.cart': 'Y' })).toBe('Y');
    expect(lookup('nav.cart', {}, {})).toBe('Cart');
    expect(format('Cart · {n}', { n: 3 })).toBe('Cart · 3');
    expect(format('keep {keep}', { n: 1 })).toBe('keep {keep}');
    expect(placeholders('a {x} b {y} {x}')).toEqual(['x', 'y']);
    expect(placeholderProblem('Keep {keep}', 'Behalten')).toMatch(/placeholders/);
  });
  it('menus in a language: words and prefixed public addresses; dashboards keep theirs', async () => {
    const b = await bundled('bn');
    const t = (k: string) => lookup(k, {}, b);
    const nav = localizeNav(PUBLIC_LINKS, t, 'bn');
    expect(nav.map((l) => l.href)).toEqual(['/bn/websites', '/bn/domains', '/bn/sellers', '/bn/sell', '/bn/affiliates', '/bn/help']);
    expect(nav[0].label).toBe('ওয়েবসাইট');
    const foot = localizeFooter(FOOTER_COLUMNS, t, 'bn');
    expect(foot.flatMap((c) => c.links.map((l) => l.href))).toContain('/dashboard/seller');
    expect(foot.flatMap((c) => c.links.map((l) => l.href))).toContain('/bn/help#contact');
    expect(foot.every((c) => c.title !== '' && c.links.every((l) => l.label))).toBe(true);
  });
});

describe('Language Management (memory store)', () => {
  it('a draft language is never shown; publishing the language and the words shows them; English and the source stay safe', async () => {
    const store = await import('@/lib/i18n/store');
    const server = await import('@/lib/i18n/server');
    const read = await import('@/lib/i18n/settingsRead');
    hdr.lang = 'bn';
    expect(await server.requestLang()).toBe('en'); // bn is a draft
    const s = (await read.languageSettings()).languages;
    expect((await store.saveLanguages('admin', { defaultLang: 'en', languages: s.filter((l) => l.code !== 'bn') })).ok).toBe(true); // a built-in left out is kept
    expect((await read.languageSettings()).languages.some((l) => l.code === 'bn')).toBe(true);
    const on = s.map((l) => (l.code === 'bn' || l.code === 'ar' ? { ...l, published: true } : l));
    expect((await store.saveLanguages('admin', { defaultLang: 'en', languages: on })).ok).toBe(true);
    expect(await server.requestLang()).toBe('bn');
    let i = await server.getI18n();
    expect(i.t('nav.cart')).toBe('কার্ট'); // the bundled draft
    expect(i.languages.map((l) => l.code)).toEqual(['en', 'bn', 'ar']);
    expect((await store.saveDraftWords('admin', 'bn', { 'page.home.pillars.p3points': 'no placeholders here' })).ok).toBe(false); // must keep {keep}, {minPrice}
    expect((await store.saveDraftWords('admin', 'bn', { 'nav.cart': 'ঝুড়ি', 'product.shop-one.name': 'দোকান', 'seo./help.title': 'সাহায্য', 'bad key!': 'x' })).ok).toBe(true);
    i = await server.getI18n();
    expect(i.t('nav.cart')).toBe('কার্ট'); // a draft is not live
    expect((await store.publishWords('admin', 'bn', 'publish')).ok).toBe(true);
    i = await server.getI18n();
    expect([i.t('nav.cart'), i.pick('product.shop-one.name', 'Shop One'), i.pick('product.other.name', 'Other')]).toEqual(['ঝুড়ি', 'দোকান', 'Other']);
    expect((await store.publishWords('admin', 'bn', 'unpublish')).ok).toBe(true);
    expect((await server.getI18n()).t('nav.cart')).toBe('কার্ট');
    hdr.lang = 'ar';
    expect((await server.getI18n()).dir).toBe('rtl');
    hdr.lang = 'xx';
    expect(await server.requestLang()).toBe('en'); // a made-up header is ignored
    expect((await store.saveDraftWords('admin', 'en', { 'nav.cart': 'x' })).ok).toBe(false); // English is the source
    const log = ((globalThis as { __auditMem?: { action: string }[] }).__auditMem ?? []).map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(['i18n_languages_saved', 'i18n_draft_saved', 'i18n_words_published', 'i18n_words_unpublished']));
    hdr.lang = 'en';
    await store.saveLanguages('admin', { defaultLang: 'en', languages: s });
  });
  it('search engines: hreflang for live languages with x-default; nothing while only English is live', async () => {
    const { alternateLanguages } = await import('@/lib/i18n/seo');
    const live = liveLanguages(cleanLanguages({ languages: [{ code: 'bn', published: true }] }));
    const alt = alternateLanguages('/websites', live);
    expect(alt.en.endsWith('/websites')).toBe(true);
    expect(alt.bn.endsWith('/bn/websites')).toBe(true);
    expect(alt['x-default']).toBe(alt.en);
    expect(alternateLanguages('/websites', liveLanguages(cleanLanguages(null)))).toEqual({});
  });
});
