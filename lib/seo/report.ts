import 'server-only';
import { getLiveDbProducts } from '../catalog';
import { starterProducts } from '../examples';
import { SITE_NAME } from '../site';
import type { SeoRow } from './check';
import { autoListingMeta, listingPath } from './listingMeta';
import { SEO_PAGES } from './pageList';
import { allPageSeo } from './pageMeta';

const PLATFORMS = ['web', 'android', 'ios', 'webapp', 'desktop', 'digital'] as const;

/* Every live listing (sellers' and, while they are shown, the examples), once each. */
export async function liveListings() {
  const live = (await Promise.all(PLATFORMS.map((pl) => getLiveDbProducts(pl)))).flat();
  return [...live, ...(await starterProducts())].filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i);
}

/* What each page and listing gives search engines right now: the admin's words where saved, otherwise the built-in or automatic ones. */
export async function seoRows(): Promise<SeoRow[]> {
  const saved = await allPageSeo(0);
  const pages: SeoRow[] = SEO_PAGES.map((p) => {
    const s = saved[p.path];
    return {
      path: p.path,
      name: p.name,
      kind: p.path.includes('?topic=') ? 'topic' : 'page',
      title: s?.title || `${p.title} · ${SITE_NAME}`,
      description: s?.description || p.description,
      changed: !!(s?.title || s?.description),
    };
  });
  const listings: SeoRow[] = (await liveListings()).map((p) => {
    const path = listingPath(p.id);
    const s = saved[path];
    const auto = autoListingMeta(p);
    return { path, name: p.name, kind: 'listing', title: s?.title || `${auto.title} · ${SITE_NAME}`, description: s?.description || auto.description, changed: !!(s?.title || s?.description) };
  });
  return [...pages, ...listings];
}
