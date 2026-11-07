import 'server-only';
import { platformOf } from '../apps';
import type { Product } from '../data';
import { examplesAllowed } from '../exampleMode';
import { starterProducts } from '../examples';
import { isPublic } from '../seo/controls';
import { allControls } from '../seo/controlStore';
import { allocation, hubOf, realListings, type Allocation } from '../seo/hubStore';
import { HUBS, type HubCopy } from '../seo/hubs';
import { listingPath } from '../seo/listingMeta';
import { DEFAULT_CONTROLS } from '../seo/controls';
import { createAdminClient } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';
import { publicListing } from './words';

export const websitePath = (id: string) => `/websites/${id}`;
export const categoryPath = (slug: string) => `/websites/category/${slug}`;
export const CATEGORY_SLUGS = HUBS.map((h) => h.slug);

/* The websites a visitor can see: live, published seller listings. The made-up examples only show where the shop has no database. */
export async function publicWebsites(): Promise<Product[]> {
  const ctl = await allControls();
  const real = (await realListings()).filter((p) => platformOf(p) === 'web' && isPublic(listingPath(p.id), ctl[listingPath(p.id)] ?? DEFAULT_CONTROLS));
  const list = examplesAllowed() ? [...real, ...(await starterProducts()).filter((p) => platformOf(p) === 'web')] : real;
  return list.filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i).map(publicListing);
}

export async function websiteCategories(): Promise<{ alloc: Allocation; of: (p: Product) => HubCopy | null }> {
  const alloc = await allocation();
  return { alloc, of: (p) => hubOf(p, alloc) };
}

/* The public face of a seller. Built field by field, so a payout detail can never reach a page. */
export type PublicSeller = {
  key: string;
  handle: string;
  name: string;
  headline: string;
  about: string;
  skills: string[];
  customAvailable: boolean;
  replyTime: string;
  country: string | null;
  verified: boolean;
  joined: string | null;
  websites: Product[];
  rating: number;
  reviews: number;
  sold: number;
};

const slugName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
/* A chosen username, or an address made from the name and a piece of the id, so two people with one name never share it. Pure. */
export const sellerHandle = (username: string | null | undefined, name: string, id: string) => username || `${slugName(name) || 'seller'}-${id.replace(/-/g, '').slice(0, 6)}`;

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  id_verified: boolean | null;
  created_at: string | null;
  username?: string | null;
  headline?: string | null;
  skills?: string[] | null;
  custom_available?: boolean | null;
  reply_time?: string | null;
  country?: string | null;
  store_paused?: boolean | null;
};

export async function publicSellers(): Promise<PublicSeller[]> {
  const sites = await publicWebsites();
  const groups = new Map<string, Product[]>();
  for (const p of sites) {
    if (p.ownerType === 'platform') continue; // SellOnBay's own listings are not a seller's store
    const key = p.sellerId ?? `name:${p.seller}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const profiles = new Map<string, ProfileRow>();
  if (supabaseConfigured && groups.size) {
    const ids = [...groups.keys()].filter((k) => !k.startsWith('name:'));
    // '*' so the page keeps working before migration 0075 adds the store fields; only the fields named below are ever used.
    const { data } = ids.length ? await createAdminClient().from('seller_profiles').select('*').in('user_id', ids) : { data: [] };
    for (const r of (data ?? []) as ProfileRow[]) profiles.set(r.user_id, r);
  }
  return [...groups.entries()]
    .map(([key, websites]) => {
      const r = profiles.get(key);
      const name = r?.display_name || websites[0].seller;
      const rated = websites.filter((w) => w.reviews > 0);
      const reviews = rated.reduce((s, w) => s + w.reviews, 0);
      return {
        key,
        handle: sellerHandle(
          r?.username,
          name,
          key
            .replace(/^name:/, 'x')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ''),
        ),
        name,
        headline: r?.headline ?? '',
        about: r?.bio ?? '',
        skills: r?.skills ?? [],
        customAvailable: !!r?.custom_available,
        replyTime: r?.reply_time ?? '',
        country: r?.country ?? null,
        verified: !!r?.id_verified,
        joined: r?.created_at ?? null,
        websites,
        rating: reviews ? rated.reduce((s, w) => s + w.rating * w.reviews, 0) / reviews : 0,
        reviews,
        sold: websites.reduce((s, w) => s + w.sold, 0),
      };
    })
    .sort((a, b) => b.sold - a.sold || b.rating - a.rating || a.name.localeCompare(b.name));
}
export const sellerByHandle = async (handle: string) => (await publicSellers()).find((s) => s.handle === handle) ?? null;
