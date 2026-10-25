import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { htmlToMarkdown, type MdNode } from '@/lib/htmlToMarkdown';
import { parseMarkdown } from '@/lib/markdown';
import { isHubPath } from '@/lib/seo/hubs';
import { PAGE_WORDS_MAX, SEO_PAGES, pageWordsProblem } from '@/lib/seo/pageList';
import { pageWords, setPageWords } from '@/lib/seo/pageWords';

const files = (() => {
  const out: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.tsx$/.test(n) && out.push(join(d, n))));
  walk('app');
  return out;
})();

describe('page words an admin can rewrite', () => {
  it('every page with words reads them, and every page that reads words is listed', () => {
    const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const used = new Set([...src.matchAll(/pageWords\('([^']+)'\)|<LegalPage path="([^"]+)"/g)].map((m) => m[1] ?? m[2]));
    // The five template categories read their words through the category route (hubPath), checked below.
    const listed = SEO_PAGES.filter((p) => p.words && !isHubPath(p.path)).map((p) => p.path);
    expect(readFileSync('app/(site)/templates/[category]/page.tsx', 'utf8')).toContain('pageWords(hubPath(hub))');
    expect(SEO_PAGES.filter((p) => isHubPath(p.path)).every((p) => p.words)).toBe(true);
    expect(listed.length).toBeGreaterThanOrEqual(15);
    for (const p of listed) expect(used, `${p} has words in lib/seo/pageList.ts but its page never reads them`).toContain(p);
    for (const u of used) expect(listed).toContain(u);
    // policy pages only: a whole-text rewrite is offered where the page is plain text
    expect(SEO_PAGES.filter((p) => p.words?.body).map((p) => p.path)).toEqual(['/terms', '/privacy', '/refunds', '/acceptable-use', '/seller-agreement', '/dmca']);
  });

  it('shows the built-in words until an admin saves, then the saved ones, and empty goes back', async () => {
    expect(await pageWords('/faq')).toEqual({ heading: 'Questions people ask', intro: 'Short answers about buying, selling, money and safety.', body: null });
    expect(await setPageWords('admin-1', '/faq', { heading: '  Your questions, answered ', intro: 'Money, delivery and safety in plain words.', body: '' })).toEqual({ ok: true });
    expect(await pageWords('/faq')).toEqual({ heading: 'Your questions, answered', intro: 'Money, delivery and safety in plain words.', body: null });
    const log = (await auditList(20)).find((e) => e.action === 'page_words_changed' && e.targetRef === '/faq');
    expect(log?.detail).toMatchObject({ from: { heading: '' }, to: { heading: 'Your questions, answered' } });
    expect(await setPageWords('admin-1', '/faq', { heading: '', intro: '', body: '' })).toEqual({ ok: true });
    expect((await pageWords('/faq')).heading).toBe('Questions people ask');
  });

  it('a policy page shows its saved text as safe blocks, never raw HTML', async () => {
    expect((await pageWords('/refunds')).body).toBeNull();
    const text = '## When you can get money back\n\nIf the site **does not work**, open a [dispute](/refunds).\n\n- Not as described\n- Malware\n\n<script>alert(1)</script>';
    expect(await setPageWords('admin-1', '/refunds', { heading: '', intro: '', body: text })).toEqual({ ok: true });
    const w = await pageWords('/refunds');
    expect(w.heading).toBe('Refunds');
    expect(w.body?.map((b) => b.t)).toEqual(['h2', 'p', 'ul', 'p']);
    expect(JSON.stringify(w.body)).toContain('"href":"/refunds"');
    expect(w.body?.[3]).toEqual({ t: 'p', c: [{ t: 'text', v: '<script>alert(1)</script>' }] }); // shown as words, React escapes them
    await setPageWords('admin-1', '/refunds', { heading: '', intro: '', body: '' });
  });

  it('refuses what does not fit', async () => {
    const spec = SEO_PAGES.find((p) => p.path === '/sell')!.words;
    expect(pageWordsProblem({ heading: 'x'.repeat(PAGE_WORDS_MAX.heading + 1), intro: '', body: '' }, spec)).toMatch(/heading/);
    expect(pageWordsProblem({ heading: 'two\nlines', intro: '', body: '' }, spec)).toMatch(/one line/);
    expect(pageWordsProblem({ heading: 'Sell <b>now</b>', intro: '', body: '' }, spec)).toMatch(/< and >/);
    expect(pageWordsProblem({ heading: '', intro: 'x'.repeat(PAGE_WORDS_MAX.intro + 1), body: '' }, spec)).toMatch(/intro/);
    expect(pageWordsProblem({ heading: '', intro: '', body: 'a whole new page' }, spec)).toMatch(/only its heading/); // /sell has no plain text body
    expect(await setPageWords('admin-1', '/browse', { heading: 'x', intro: '', body: '' })).toMatchObject({ ok: false, status: 404 }); // built from live parts
    expect(await setPageWords('admin-1', '/dashboard/admin', { heading: 'x', intro: '', body: '' })).toMatchObject({ ok: false, status: 404 });
    expect(await setPageWords('admin-1', '/terms', { heading: '', intro: '', body: 'x'.repeat(PAGE_WORDS_MAX.body + 1) })).toMatchObject({ ok: false, status: 400 });
    expect(await setPageWords('admin-1', '/find', { heading: '', intro: '', body: '' })).toMatchObject({ ok: false, status: 409 });
  });
});

/* A tiny stand-in for DOM nodes, enough for the converter. */
const t = (v: string): MdNode => ({ nodeType: 3, nodeName: '#text', textContent: v, childNodes: [] });
const el = (name: string, kids: MdNode[] = [], attrs: Record<string, string> = {}): MdNode => ({
  nodeType: 1,
  nodeName: name.toUpperCase(),
  textContent: kids.map((k) => k.textContent).join(''),
  childNodes: kids,
  getAttribute: (n) => attrs[n] ?? null,
});

describe('starting a rewrite from the current page text', () => {
  it('turns headings, paragraphs, lists and links into Markdown that reads back the same', () => {
    const root = el('div', [
      el('p', [t('These terms cover '), el('strong', [t('your use')]), t(' of the site.')]),
      el('h2', [t('Buying a site')]),
      el('ul', [el('li', [t('Delivery takes\n   1 to 7 days.')]), el('li', [t('See '), el('a', [t('refunds')], { href: '/refunds' }), t('.')])]),
      el('h3', [t('Small print')]),
      el('ol', [el('li', [el('em', [t('First')])]), el('li', [t('Second')])]),
      el('div', [t('Loose words'), el('p', [t('In a box.')])]),
      el('script', [t('bad()')]),
    ]);
    const md = htmlToMarkdown(root);
    expect(md).toBe(
      [
        'These terms cover **your use** of the site.',
        '## Buying a site',
        '- Delivery takes 1 to 7 days.\n- See [refunds](/refunds).',
        '### Small print',
        '1. *First*\n2. Second',
        'Loose words',
        'In a box.',
      ].join('\n\n'),
    );
    expect(parseMarkdown(md).map((b) => b.t)).toEqual(['p', 'h2', 'ul', 'h3', 'ol', 'p', 'p']);
  });
});
