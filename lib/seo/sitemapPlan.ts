import 'server-only';
import { publishedPosts } from '../posts';
import { SITE_URL } from '../site';
import { DEFAULT_CONTROLS, inSitemap } from './controls';
import { allControls } from './controlStore';
import { legacyPublic } from '../legacy';
import { allHubViews, allocation, hubProductPath, hubPublicPath, realListings } from './hubStore';
import { HUBS, hubPath, isHubPath } from './hubs';
import { listingPath } from './listingMeta';
import { SEO_PAGES } from './pageList';
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

async function legacyPlan(): Promise<SitemapEntry[]> {
  const ctl = await allControls();
  const entry = (path: string, kind: SitemapEntry['kind'], extra: Partial<SitemapEntry> = {}): SitemapEntry => ({
    url: SITE_URL + path,
    path,
    group: kind === 'category' || kind === 'product' ? 'primary' : 'additional',
    kind,
    changeFrequency: 'weekly',
    ...extra,
  });
  const out: SitemapEntry[] = [entry('', 'home')];
  for (const p of SEO_PAGES) if (!isHubPath(p.path) && inSitemap(p.path, ctl[p.path] ?? DEFAULT_CONTROLS)) out.push(entry(p.path, 'page'));
  for (const x of await categoryPages()) out.push(entry(`/${x.copy.group}/${x.copy.slug}`, 'category'));
  // The five template hubs: only when published, allowed in search, and holding enough real listings to be more than a thin page.
  const alloc = await allocation();
  for (const v of await allHubViews()) if (v.indexable && inSitemap(hubPath(v.hub), ctl[hubPath(v.hub)] ?? DEFAULT_CONTROLS)) out.push(entry(hubPublicPath(v.hub, alloc), 'category'));
  // Sellers' live listings only: the example listings are never submitted to search engines. An admin can close or unlist any of them.
  for (const p of await realListings()) if (inSitemap(listingPath(p.id), ctl[listingPath(p.id)] ?? DEFAULT_CONTROLS)) out.push(entry(listingPath(p.id), 'product'));
  for (const p of (await publishedPosts(1000)).filter((q) => !q.noindex)) out.push(entry(`/blog/${p.slug}`, 'post', { lastModified: new Date(p.updatedAt), changeFrequency: 'monthly' }));
  return out.filter((e, i, a) => a.findIndex((r) => r.url === e.url) === i);
}

export const sitemapCounts = (plan: SitemapEntry[]) => ({
  primary: plan.filter((e) => e.group === 'primary').length,
  additional: plan.filter((e) => e.group === 'additional').length,
  total: plan.length,
});

/*
 * The public sitemap: the home page (E-commerce Templates), the four other category pages and up to four real products in each of the five categories,
 * 25 addresses when everything is ready. A category page is listed only when it shows its four products; a product only when published and allowed in search.
 * Nothing is invented to reach 25: the gate below says what is missing. (With NEXT_PUBLIC_LEGACY_PUBLIC=1 the older, larger sitemap is built.)
 */
export const PRIMARY_TARGET = 25;
export const PER_CATEGORY = 4;

export type Gate = { target: number; ready: number; complete: boolean; categories: { slug: string; name: string; have: number; need: number; categoryPage: boolean }[] };

async function primary(): Promise<{ entries: SitemapEntry[]; gate: Gate }> {
  const ctl = await allControls();
  const alloc = await allocation();
  const e = (path: string, kind: SitemapEntry['kind']): SitemapEntry => ({ url: SITE_URL + path, path, group: 'primary', kind, changeFrequency: 'weekly' });
  const entries: SitemapEntry[] = [];
  const home = inSitemap('/', ctl['/'] ?? DEFAULT_CONTROLS);
  if (home) entries.push(e('/', 'home'));
  const categories: Gate['categories'] = [];
  for (const v of await allHubViews()) {
    const products = v.products.slice(0, PER_CATEGORY).filter((p) => inSitemap(listingPath(p.id), ctl[listingPath(p.id)] ?? DEFAULT_CONTROLS));
    const isHome = v.hub.slug === 'ecommerce';
    const pageOk = !isHome && products.length === PER_CATEGORY && inSitemap(hubPath(v.hub), ctl[hubPath(v.hub)] ?? DEFAULT_CONTROLS);
    if (pageOk) entries.push(e(hubPublicPath(v.hub, alloc), 'category'));
    for (const p of products) entries.push(e(hubProductPath(v.hub, alloc, p.id), 'product'));
    categories.push({ slug: v.hub.slug, name: v.hub.name, have: products.length, need: PER_CATEGORY, categoryPage: isHome ? home : pageOk });
  }
  const out = entries.filter((x, i, a) => a.findIndex((r) => r.url === x.url) === i);
  return { entries: out, gate: { target: PRIMARY_TARGET, ready: out.length, complete: out.length === PRIMARY_TARGET, categories } };
}

export const publicationGate = async (): Promise<Gate> => (await primary()).gate;

export async function sitemapPlan(): Promise<SitemapEntry[]> {
  return legacyPublic() ? legacyPlan() : (await primary()).entries;
}
