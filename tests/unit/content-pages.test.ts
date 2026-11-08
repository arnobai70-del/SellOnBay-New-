import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isDocName } from '@/lib/cms/docs';
import { arrange, checkPageDoc, EMPTY_DOC, fill, PAGES, pageByKey } from '@/lib/content/registry';
import { PLAN_KEEP_TEXT, REVIEW_HOURS } from '@/lib/config';

const src = (p: string) => readFileSync(p, 'utf8');
const home = pageByKey('home')!;

describe('editable public pages (owner, 2026-11-08)', () => {
  it('covers the public pages, the top bar, the footer and the 404 page; legal pages stay in the versioned legal documents', () => {
    const keys = PAGES.map((p) => p.key);
    for (const k of ['home', 'websites', 'website', 'domains', 'sellers', 'sell', 'buyer-protection', 'help', 'guides', 'not-found', 'nav', 'footer', 'terms', 'privacy']) expect(keys, k).toContain(k);
    expect(isDocName('page:home')).toBe(true);
    expect(isDocName('page:terms')).toBe(false);
    expect(isDocName('page:nope')).toBe(false);
  });
  it('fills numbers from the rules, never from the copy', () => {
    expect(fill('Keep {keep}, review {reviewHours} hours')).toBe(`Keep ${PLAN_KEEP_TEXT}, review ${REVIEW_HOURS} hours`);
    expect(home.sections.flatMap((s) => s.fields.map((f) => f.default)).join(' ')).not.toMatch(/\b78%|\b22%|48-hour/);
  });
  it('keeps only known plain-text fields, safe links and changed words', () => {
    const ok = checkPageDoc(home, { text: { 'hero.title': 'Hello', 'pillars.p1href': '/guides', 'nope.x': 'y', 'hero.search': home.sections[0].fields[2].default } });
    expect(ok).toMatchObject({ ok: true, value: { text: { 'hero.title': 'Hello', 'pillars.p1href': '/guides' } } });
    expect(checkPageDoc(home, { text: { 'hero.title': '<b>Hi</b>' } }).ok).toBe(false);
    expect(checkPageDoc(home, { text: { 'pillars.p1href': 'javascript:alert(1)' } }).ok).toBe(false);
    expect(checkPageDoc(home, { seo: { ogImage: 'http://x' } }).ok).toBe(false);
  });
  it('reorders and hides sections, but never the top banner', () => {
    const doc = { ...EMPTY_DOC, order: ['sell', 'featured', 'hero'], hidden: ['how', 'hero'] };
    const c = checkPageDoc(home, doc);
    expect(c.ok && c.value.order).toEqual(['sell', 'featured']);
    expect(c.ok && c.value.hidden).toEqual(['how']);
    expect(arrange(home, c.ok ? c.value : EMPTY_DOC)).toEqual(['sell', 'featured', 'pillars', 'domains', 'sellers']);
  });
  it('publishing needs the CMS four-eyes rule, writes SEO through the one store, and is for Content admins', () => {
    const api = src('app/api/admin/pages/route.ts');
    expect(api).toMatch(/adminOnly\('content'\)/);
    expect(api).toMatch(/publishDraft\(a\.id, a\.scopes, name\)/);
    expect(api).toMatch(/setPageSeo\(/);
    const page = src('app/(glass)/page.tsx');
    for (const s of ['pillars', 'featured', 'domains', 'how', 'sellers', 'sell']) expect(page).toContain(`c.t('${s}', 'heading')`);
    expect(page).toMatch(/c\.order\.map/);
  });
  it('removing a CMS value never deletes a settings row', () => expect(src('lib/cms/docStore.ts')).not.toMatch(/\.delete\(\)/));
});
