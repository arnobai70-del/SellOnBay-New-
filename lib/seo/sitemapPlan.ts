import 'server-only';
import { publicSlug } from '@/lib/glass/publicSlug';
import { publishedPosts } from '../posts';
import { SITE_URL } from '../site';
import { DEFAULT_CONTROLS, inSitemap } from './controls';
import { allControls } from './controlStore';
import { allHubViews, allocation, hubProductPath, hubPublicPath, realListings } from './hubStore';
import { HUBS, hubPath, isHubPath } from './hubs';
import { listingPath } from './listingMeta';
import { INDEXED_PAGES, SEO_PAGES } from './pageList';
import { platformOf } from '../apps';
import { categoryPages } from './pages';

/*
 * The one list behind sitemap.xml and the admin counts. A URL is in only when it is published, public, allowed to be indexed and switched on.
 * Never in: private or account routes (they are not in SEO_PAGES at all), drafts, archived pages, and the made-up example listings.
 * `primary` = category pages and real product pages (the commercial pages the SEO plan counts); `additional` = home, information, legal and blog pages.
 * There is no ceiling: every eligible page is listed.
 */
export type SitemapEntry = {
  url: string;
  path: string;
  group: 'primary' | 'additional';
  kind: 'home' | 'page' | 'category' | 'product' | 'post';
  lastModified?: Date;
  changeFrequency: 'weekly' | 'monthly';
};

export const sitemapCounts = (plan: SitemapEntry[]) => ({
  primary: plan.filter((e) => e.group === 'primary').length,
  additional: plan.filter((e) => e.group === 'additional').length,
  total: plan.length,
});

/*
 * The public sitemap: the home page, the public pages, category pages with enough real listings, every live website and the guides (owner, 2026-11-07). Nothing is invented; the gate says what is missing.
 * (With NEXT_PUBLIC_LEGACY_PUBLIC=1 the older, larger sitemap is built.)
 */
export const PRIMARY_TARGET = 25;
export const PER_CATEGORY = 4;
const MIN_FOR_CATEGORY = 3; // a thinner category page stays out of search

export type Gate = { target: number; ready: number; complete: boolean; categories: { slug: string; name: string; have: number; need: number; categoryPage: boolean }[] };

async function primary(): Promise<{ entries: SitemapEntry[]; gate: Gate }> {
  const ctl = await allControls();
  const alloc = await allocation();
  const e = (path: string, kind: SitemapEntry['kind'], extra: Partial<SitemapEntry> = {}): SitemapEntry => ({
    url: SITE_URL + path,
    path,
    group: kind === 'category' || kind === 'product' ? 'primary' : 'additional',
    kind,
    changeFrequency: 'weekly',
    ...extra,
  });
  const entries: SitemapEntry[] = [];
  if (inSitemap('/', ctl['/'] ?? DEFAULT_CONTROLS)) entries.push(e('/', 'home'));
  for (const path of INDEXED_PAGES) if (inSitemap(path, ctl[path] ?? DEFAULT_CONTROLS)) entries.push(e(path, 'page'));
  const categories: Gate['categories'] = [];
  for (const v of await allHubViews()) {
    const products = v.products.filter((p) => inSitemap(listingPath(p.id), ctl[listingPath(p.id)] ?? DEFAULT_CONTROLS));
    const pageOk = products.length >= MIN_FOR_CATEGORY && inSitemap(hubPath(v.hub), ctl[hubPath(v.hub)] ?? DEFAULT_CONTROLS);
    if (pageOk) entries.push(e(hubPublicPath(v.hub, alloc), 'category'));
    categories.push({ slug: v.hub.slug, name: v.hub.name, have: products.length, need: MIN_FOR_CATEGORY, categoryPage: pageOk });
  }
  // Every live website, whichever category it is in.
  for (const p of await realListings())
    if (platformOf(p) === 'web' && inSitemap(listingPath(p.id), ctl[listingPath(p.id)] ?? DEFAULT_CONTROLS)) entries.push(e(`/websites/${publicSlug(p.id)}`, 'product'));
  for (const p of (await publishedPosts(1000)).filter((q) => !q.noindex)) entries.push(e(`/guides/${p.slug}`, 'post', { lastModified: new Date(p.updatedAt), changeFrequency: 'monthly' }));
  const out = entries.filter((x, n, a) => a.findIndex((r) => r.url === x.url) === n);
  const ready = out.filter((x) => x.group === 'primary').length;
  return { entries: out, gate: { target: PRIMARY_TARGET, ready, complete: ready >= PRIMARY_TARGET, categories } };
}

export const publicationGate = async (): Promise<Gate> => (await primary()).gate;

export async function sitemapPlan(): Promise<SitemapEntry[]> {
  return (await primary()).entries;
}
