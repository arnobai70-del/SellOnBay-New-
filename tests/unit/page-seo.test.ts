import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { SEO_PAGES } from '@/lib/seo/pageList';
import { pageMetadata, setPageSeo } from '@/lib/seo/pageMeta';

describe('page titles and descriptions an admin can change', () => {
  it('lists each public page once, and every listed page reads its words through pageMetadata', () => {
    const paths = SEO_PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of SEO_PAGES) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.path).toMatch(/^\/[a-z/-]+(\?topic=[a-z0-9-]+)?$/);
    }
    // Every page file that calls pageMetadata names a listed path (a typo would silently keep the built-in words).
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : n === 'page.tsx' && files.push(join(d, n))));
    walk('app');
    const used = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/pageMetadata\('([^']+)'/g)].map((m) => m[1]));
    expect(used.length).toBeGreaterThan(15);
    for (const u of used) expect(paths).toContain(u);
  });

  it('uses the built-in words until an admin saves, then exactly what was saved', async () => {
    expect(await pageMetadata('/faq')).toMatchObject({ title: 'Questions and answers' });
    expect((await pageMetadata('/faq')).openGraph).toBeUndefined(); // the site-wide share card stays
    expect(await setPageSeo('admin-1', '/faq', { title: '  Website questions answered  ', description: 'Escrow, refunds, delivery and domains in plain words.' })).toEqual({ ok: true });
    const m = await pageMetadata('/faq');
    expect(m.title).toEqual({ absolute: 'Website questions answered' });
    expect(m.description).toBe('Escrow, refunds, delivery and domains in plain words.');
    expect(m.openGraph).toMatchObject({ title: 'Website questions answered', description: 'Escrow, refunds, delivery and domains in plain words.' });
    expect((await auditList(10)).some((e) => e.action === 'seo_page_changed' && e.targetRef === '/faq')).toBe(true);

    // Empty boxes go back to the built-in words.
    expect(await setPageSeo('admin-1', '/faq', { title: '', description: '' })).toEqual({ ok: true });
    expect(await pageMetadata('/faq')).toMatchObject({ title: 'Questions and answers' });
  });

  it('keeps a page’s own extras and refuses bad input', async () => {
    const m = await pageMetadata('/tools/site-ideas', { alternates: { canonical: '/tools/site-ideas' } });
    expect(m).toMatchObject({ title: 'Free website idea and domain name generator', alternates: { canonical: '/tools/site-ideas' } });
    expect(await setPageSeo('admin-1', '/dashboard/admin', { title: 'x', description: '' })).toMatchObject({ ok: false, status: 404 });
    expect(await setPageSeo('admin-1', '/browse', { title: 'x'.repeat(71), description: '' })).toMatchObject({ ok: false, status: 400 });
    expect(await setPageSeo('admin-1', '/browse', { title: 'Sites <b>', description: '' })).toMatchObject({ ok: false, status: 400 });
    expect(await setPageSeo('admin-1', '/browse', { title: '', description: '' })).toMatchObject({ ok: false, status: 409 });
  });
});
