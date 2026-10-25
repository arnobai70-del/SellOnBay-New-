import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DIGITAL_TOPICS, catsFor, platformOf, shelfHref, shelfLabel, type Platform } from './apps';
import { getLiveDbProducts } from './catalog';
import { CATS, type Product } from './data';
import { getDevs } from './devsDb';
import { starterProducts } from './examples';
import { legacyPublic } from './legacy';
import { allHubViews, allocation, hubProductPath, hubPublicPath } from './seo/hubStore';
import { HUBS } from './seo/hubs';
import { markdownText } from './markdown';
import { publishedPosts } from './posts';
import { SEO_PAGES } from './seo/pageList';
import { type Doc, type Hit, pageSections, searchDocs, textFragment, words } from './siteSearchCore';

/*
 * The site search (owner, 2026-10-21): products on every shelf, categories and topics, the words on the public pages, blog posts and
 * developers. Page words come from the pages the build already wrote out (.next/server/app/<page>.html), read once per server copy and
 * cut into sections at each heading, so a word on the third screen of the terms page is found too; a page the build did not write out
 * is still found by its name and description. Products and posts are read fresh (the product list has its own short cache).
 */
const SHELVES: Platform[] = ['web', 'android', 'ios', 'webapp', 'desktop', 'digital'];
const BUILT = path.join(process.cwd(), '.next', 'server', 'app');

let pagesOnce: Promise<Doc[]> | null = null;
function pageDocs(): Promise<Doc[]> {
  pagesOnce ??= (async () => {
    const out: Doc[] = [];
    for (const p of SEO_PAGES) {
      if (p.path.includes('?')) continue; // topics are found as categories
      const file = p.path === '/' ? 'index.html' : `${p.path.slice(1)}.html`;
      const html = await readFile(path.join(BUILT, file), 'utf8').catch(() => '');
      const sections = html ? pageSections(html) : [];
      if (!sections.length) {
        out.push({ kind: 'page', title: p.title, href: p.path, text: p.description });
        continue;
      }
      sections.forEach((s, i) =>
        out.push({ kind: 'page', title: s.heading ? `${p.title}: ${s.heading}` : p.title, href: p.path, text: i === 0 && !s.heading ? `${p.description} ${s.text}` : s.text }),
      );
    }
    return out;
  })().catch(() => {
    pagesOnce = null; // try again next time
    return [];
  });
  return pagesOnce;
}

const productDoc = (p: Product): Doc => ({
  kind: 'product',
  title: p.name,
  href: `/product/${p.id}`,
  sub: `${p.cat} · ${shelfLabel(platformOf(p))}`,
  text: [p.tag, p.desc, p.stack ?? '', ...p.inc].filter(Boolean).join(' · '),
});

async function productDocs(): Promise<{ docs: Doc[]; all: Product[] }> {
  if (!legacyPublic()) {
    // The public site is the five template categories: only their products are found, at their public addresses.
    const alloc = await allocation();
    const rows = (await allHubViews()).flatMap((v) => v.products.map((p) => ({ p, hub: v.hub })));
    return { docs: rows.map(({ p, hub }) => ({ ...productDoc(p), href: hubProductPath(hub, alloc, p.id), sub: hub.name })), all: rows.map((r) => r.p) };
  }
  const live = (await Promise.all(SHELVES.map((pl) => getLiveDbProducts(pl)))).flat();
  const ids = new Set(live.map((p) => p.id));
  const all = [...live, ...(await starterProducts()).filter((p) => !ids.has(p.id))];
  return { docs: all.map(productDoc), all };
}

function categoryDocs(all: Product[]): Doc[] {
  const out: Doc[] = [];
  for (const pl of SHELVES) {
    const cats = pl === 'web' ? CATS.filter((c) => c !== 'All') : catsFor(pl);
    for (const c of cats) {
      const n = all.filter((p) => platformOf(p) === pl && p.cat === c).length;
      if (!n) continue;
      out.push({ kind: 'category', title: `${c}`, href: `${shelfHref(pl)}?cat=${encodeURIComponent(c)}`, sub: `${shelfLabel(pl)} · ${n} ${n === 1 ? 'product' : 'products'}`, text: '' });
    }
  }
  for (const t of DIGITAL_TOPICS) out.push({ kind: 'category', title: t.label, href: `/apps/digital?topic=${t.key}`, sub: 'Digital products', text: `${t.lead} ${t.cats.join(' ')}` });
  return out;
}

async function postDocs(): Promise<Doc[]> {
  return (await publishedPosts()).map((p) => ({ kind: 'post', title: p.title, href: `/blog/${p.slug}`, sub: 'Blog', text: `${p.excerpt} ${markdownText(p.body)}` }));
}

async function devDocs(): Promise<Doc[]> {
  return (await getDevs()).map((d) => ({
    kind: 'developer',
    title: d.name,
    href: `/developers/${d.id}`,
    sub: d.headline,
    text: [d.gig, d.bio, d.areas.join(' '), d.langs.join(' '), d.skills.map((s) => s.name).join(' ')].join(' · '),
  }));
}

export async function siteSearch(q: string, perKind = 50): Promise<Hit[]> {
  if (words(q).join('').length < 2) return [];
  if (!legacyPublic()) {
    // Products and the five category pages only: no pages, posts, developers or old shelves.
    const alloc = await allocation();
    const { docs } = await productDocs();
    const cats: Doc[] = HUBS.map((h) => ({ kind: 'category', title: h.name, href: hubPublicPath(h, alloc), sub: 'Website templates', text: `${h.description} ${h.cats.join(' ')}` }));
    return searchDocs([...docs, ...cats], q, perKind);
  }
  const [{ docs: products, all }, pages, posts, devs] = await Promise.all([productDocs(), pageDocs(), postDocs().catch(() => []), devDocs().catch(() => [])]);
  const hits = searchDocs([...products, ...categoryDocs(all), ...pages, ...posts, ...devs], q, perKind);
  const ws = words(q);
  // Page and post results open at the place the words were found.
  return hits.map((h) => (h.kind === 'page' || h.kind === 'post' ? { ...h, href: textFragment(h.href, h.snippet.replace(/^… /, '').replace(/ …$/, ''), ws) } : h));
}
