import 'server-only';
import type { Metadata } from 'next';
import { platformOf, shelfLabel } from '../apps';
import { productRecord } from '../catalog';
import type { Product } from '../data';
import { SITE_NAME } from '../site';
import { applyControls } from './applyControls';
import { DEFAULT_CONTROLS, type PageControls } from './controls';
import type { SeoPage } from './pageList';
import { PAGE_SEO_GOOD } from './pageList';

/*
 * Search words for a listing's own page (/product/<id>). Built automatically from the listing (name, category, shelf, description),
 * and an admin can replace them at /dashboard/admin/seo/listings (saved like any page, under "seo:page:/product/<id>").
 */
export const listingPath = (id: string) => `/product/${id}`;

/* Cut at a word near the limit, never mid-word. */
const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,.;:]+$/, '') + '…';
};

/* The automatic title and description: "Name · Category" and the seller's description, filled out when it is short. */
export function autoListingMeta(p: Product): { title: string; description: string } {
  const shelf = shelfLabel(platformOf(p)).toLowerCase();
  const base = p.desc.trim();
  const more = `${p.cat} ${shelf.replace(/s$/, '')} on ${SITE_NAME}, paid into escrow until you accept it.`;
  return {
    title: clip(`${p.name} · ${p.cat}`, PAGE_SEO_GOOD.title - SITE_NAME.length - 3),
    description: clip(base.length >= 70 ? base : `${base}${base && !/[.!?]$/.test(base) ? '.' : ''} ${more}`.trim(), PAGE_SEO_GOOD.description),
  };
}

/* A live listing as an editable page for the SEO screens, or null (unknown, not live, or not a listing address). */
export async function listingPage(path: string): Promise<(SeoPage & { product: Product }) | null> {
  const m = /^\/product\/([A-Za-z0-9_-]{1,80})$/.exec(path);
  if (!m) return null;
  const r = await productRecord(m[1]);
  if (!r || r.status !== 'live') return null;
  const auto = autoListingMeta(r.product);
  return { path, name: r.product.name, title: auto.title, description: auto.description, product: r.product };
}

/* The metadata of a listing page: the admin's words if saved, otherwise the automatic ones; kept out of search unless live. */
export function listingMetadata(p: Product, status: string, saved: { title: string; description: string } | undefined, ctl: PageControls = DEFAULT_CONTROLS): Metadata {
  const auto = autoListingMeta(p);
  const title = saved?.title.trim();
  const description = saved?.description.trim() || auto.description;
  const path = listingPath(p.id);
  const base: Metadata = {
    title: title ? { absolute: title } : auto.title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE_NAME, title: title || `${auto.title} · ${SITE_NAME}`, description, url: path },
  };
  // Only a live listing takes the admin's search settings; any other is kept out of search whatever is saved.
  return status === 'live' ? applyControls(path, base, ctl) : { ...base, robots: { index: false, follow: false } };
}
