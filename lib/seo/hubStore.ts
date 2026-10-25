import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { getLiveDbProducts } from '../catalog';
import type { Platform } from '../apps';
import { platformOf } from '../apps';
import type { Product } from '../data';
import { createAdminClient } from '../supabase/server';
import { DEFAULT_CONTROLS, isPublic } from './controls';
import { allControls } from './controlStore';
import { HUB_LIMIT, HUB_LIMIT_MAX, HUBS, hubFor, hubPath, type HubCopy } from './hubs';
import { categoryFor, MIN_PRODUCTS } from './categories';
import { listingPath } from './listingMeta';
import { settingsTableReady } from './pageMeta';
import { addRedirect, removeRedirect } from './redirectStore';
import { slugProblem } from './slug';

/*
 * Which listings each template hub shows, kept in `app_settings` under "seo:alloc" (no migration):
 *   assign: { <product id>: <hub slug> | "none" }  an admin's choice; "none" keeps a listing out of every hub
 *   limits: { <hub slug>: <number> }               how many a hub shows (default HUB_LIMIT)
 * Without a choice, a seller's live website listing joins the hub whose catalogue categories (`cats`) include its own category.
 * Only real seller listings count: the made-up examples never appear. A listing an admin set to draft or archived is left out.
 */
export type Allocation = { assign: Record<string, string>; limits: Record<string, number>; slugs: Record<string, string> };
const KEY = 'seo:alloc';
const FALLBACK_HUB = 'business';
const EMPTY: Allocation = { assign: {}, limits: {}, slugs: {} };
const mem: { saved: Allocation } = ((globalThis as { __hubAllocMem?: { saved: Allocation } }).__hubAllocMem ??= { saved: EMPTY });
const g = globalThis as { __hubAllocCache?: { at: number; value: Allocation } };
const PLATFORMS: Platform[] = ['web', 'android', 'ios', 'webapp', 'desktop', 'digital'];

export function cleanAllocation(raw: unknown): Allocation {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const assign: Record<string, string> = {};
  for (const [id, v] of Object.entries((o.assign && typeof o.assign === 'object' ? o.assign : {}) as Record<string, unknown>))
    if (typeof v === 'string' && (v === 'none' || hubFor(v)) && /^[A-Za-z0-9_-]{1,80}$/.test(id)) assign[id] = v;
  const limits: Record<string, number> = {};
  for (const [slug, v] of Object.entries((o.limits && typeof o.limits === 'object' ? o.limits : {}) as Record<string, unknown>))
    if (hubFor(slug) && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= HUB_LIMIT_MAX) limits[slug] = v as number;
  // A category's own address ending (its "SEO slug"): lowercase words and dashes, never another category's, never twice.
  const slugs: Record<string, string> = {};
  for (const [slug, v] of Object.entries((o.slugs && typeof o.slugs === 'object' ? o.slugs : {}) as Record<string, unknown>))
    if (hubFor(slug) && typeof v === 'string' && !slugProblem(v) && !HUBS.some((h) => h.slug === v && h.slug !== slug) && !Object.values(slugs).includes(v) && !categoryFor('templates', v))
      slugs[slug] = v;
  return { assign, limits, slugs };
}

export async function allocation(now = Date.now()): Promise<Allocation> {
  if (g.__hubAllocCache && now - g.__hubAllocCache.at < 30_000) return g.__hubAllocCache.value;
  let value = mem.saved;
  if (await settingsTableReady().catch(() => false)) {
    const { data } = await createAdminClient().from('app_settings').select('value').eq('key', KEY).maybeSingle();
    value = cleanAllocation(data?.value);
  }
  g.__hubAllocCache = { at: now, value };
  return value;
}

async function save(adminId: string | null, next: Allocation, what: string, ref: string, before: Allocation) {
  if (await settingsTableReady()) {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert({ key: KEY, value: next, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false as const, status: 500, error: 'Could not save.' };
  } else mem.saved = next;
  g.__hubAllocCache = undefined;
  await audit(adminId, what, 'settings', ref, { from: before, to: next });
  try {
    for (const h of HUBS) revalidatePath(hubPath(h));
    revalidatePath('/sitemap.xml');
  } catch {
    // outside a request (tests)
  }
  return { ok: true as const };
}

type Result = { ok: true } | { ok: false; status: number; error: string };

/* Put one listing in a hub, keep it out of all of them ("none"), or give it back to the automatic rule ("auto"). */
export async function setAssignment(adminId: string | null, productId: string, to: string): Promise<Result> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(productId)) return { ok: false, status: 400, error: 'Unknown listing.' };
  if (to !== 'auto' && to !== 'none' && !hubFor(to)) return { ok: false, status: 400, error: 'Unknown category.' };
  g.__hubAllocCache = undefined;
  const before = await allocation(0);
  const assign = { ...before.assign };
  if (to === 'auto') delete assign[productId];
  else assign[productId] = to;
  if (JSON.stringify(assign) === JSON.stringify(before.assign)) return { ok: false, status: 409, error: 'Nothing changed.' };
  return save(adminId, { ...before, assign }, 'seo_hub_assignment_changed', productId, before);
}

export async function setHubLimit(adminId: string | null, slug: string, n: number): Promise<Result> {
  if (!hubFor(slug)) return { ok: false, status: 404, error: 'Unknown category.' };
  if (!Number.isInteger(n) || n < 1 || n > HUB_LIMIT_MAX) return { ok: false, status: 400, error: `Pick a number from 1 to ${HUB_LIMIT_MAX}.` };
  g.__hubAllocCache = undefined;
  const before = await allocation(0);
  if ((before.limits[slug] ?? HUB_LIMIT) === n) return { ok: false, status: 409, error: 'Nothing changed.' };
  return save(adminId, { ...before, limits: { ...before.limits, [slug]: n } }, 'seo_hub_limit_changed', slug, before);
}

/* Every real seller listing that is live, once each, with the shelf it is on. */
export async function realListings(): Promise<Product[]> {
  const all = (await Promise.all(PLATFORMS.map((pl) => getLiveDbProducts(pl)))).flat();
  return all.filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i);
}

/* Pure: which hub a listing belongs to, given the choices. */
export function hubOf(p: Pick<Product, 'id' | 'cat'> & { platform?: string }, a: Allocation): HubCopy | null {
  const chosen = a.assign[p.id];
  if (chosen === 'none') return null;
  if (chosen) return hubFor(chosen) ?? null;
  // Websites go by their own category; apps and files, and any category no hub names, land in a default hub so an approved listing is never invisible.
  // An admin can still move one to another hub or to "none".
  if (!p.platform || p.platform === 'web') return HUBS.find((h) => h.cats.includes(p.cat)) ?? hubFor(FALLBACK_HUB) ?? null;
  return hubFor(FALLBACK_HUB) ?? null;
}

export type HubView = { hub: HubCopy; products: Product[]; eligible: number; limit: number; indexable: boolean };

/* Pure: what each hub shows, given the choices, the listings and the page controls. */
export function viewsFrom(a: Allocation, ctl: Awaited<ReturnType<typeof allControls>>, listings: Product[]): HubView[] {
  const open = listings.filter((p) => isPublic(listingPath(p.id), ctl[listingPath(p.id)] ?? DEFAULT_CONTROLS));
  return HUBS.map((hub) => {
    const mine = open.filter((p) => hubOf({ id: p.id, cat: p.cat, platform: platformOf(p) }, a)?.slug === hub.slug);
    const chosen = mine.filter((p) => a.assign[p.id] === hub.slug);
    const eligible = [...chosen, ...mine.filter((p) => a.assign[p.id] !== hub.slug)];
    const limit = a.limits[hub.slug] ?? HUB_LIMIT;
    const products = eligible.slice(0, limit);
    return { hub, products, eligible: eligible.length, limit, indexable: products.length >= MIN_PRODUCTS };
  });
}

/* What a hub shows now: admin-chosen listings first, then the automatic ones, up to the hub's limit. */
export async function hubView(hub: HubCopy): Promise<HubView> {
  const [a, ctl, listings] = await Promise.all([allocation(), allControls(), realListings()]);
  return viewsFrom(a, ctl, listings).find((v) => v.hub.slug === hub.slug)!;
}

/* Every hub at once from ONE read of the listings (not one read per hub). */
export async function allHubViews(): Promise<HubView[]> {
  const [a, ctl, listings] = await Promise.all([allocation(), allControls(), realListings()]);
  return viewsFrom(a, ctl, listings);
}

/* The address ending a category answers to: the admin's own, or its built-in one. */
export const hubPublicSlug = (hub: HubCopy, a: Allocation) => a.slugs[hub.slug] ?? hub.slug;
export const hubPublicPath = (hub: HubCopy, a: Allocation) => (hub.slug === 'ecommerce' ? '/' : `/templates/${hubPublicSlug(hub, a)}`);
/* A product's public address: always /templates/<category ending>/<product>. */
export const hubProductPath = (hub: HubCopy, a: Allocation, productId: string) => `/templates/${hubPublicSlug(hub, a)}/${productId}`;

/* The category a /templates/<ending> address belongs to: by its own ending, or by the admin's. */
export async function hubByEnding(ending: string): Promise<HubCopy | null> {
  const a = await allocation();
  return HUBS.find((h) => hubPublicSlug(h, a) === ending) ?? null;
}

/* Gives a category its own address ending (empty goes back to the built-in one). The built-in address is sent to the new one with a 301. */
export async function setHubSlug(adminId: string | null, slug: string, ending: string): Promise<Result> {
  const hub = hubFor(slug);
  if (!hub) return { ok: false, status: 404, error: 'Unknown category.' };
  if (hub.slug === 'ecommerce') return { ok: false, status: 400, error: 'The E-commerce category is the home page; its address cannot change.' };
  const next = ending.trim().toLowerCase();
  g.__hubAllocCache = undefined;
  const before = await allocation(0);
  const now = hubPublicSlug(hub, before);
  const want = next || hub.slug;
  if (want === now) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (next) {
    const bad = slugProblem(next);
    if (bad) return { ok: false, status: 400, error: bad };
    if (next !== hub.slug && (HUBS.some((h) => h.slug === next) || categoryFor('templates', next) || Object.entries(before.slugs).some(([k, v]) => k !== hub.slug && v === next)))
      return { ok: false, status: 409, error: 'That address is already used by another category.' };
  }
  const slugs = { ...before.slugs };
  if (want === hub.slug) delete slugs[hub.slug];
  else slugs[hub.slug] = want;
  const r = await save(adminId, { ...before, slugs }, 'seo_hub_slug_changed', slug, before);
  if (!r.ok) return r;
  // The old address (the built-in one, or the earlier choice) answers with a 301 to the new one, so no link or search listing breaks.
  if (want === hub.slug) {
    await removeRedirect(adminId, `/templates/${hub.slug}`);
    await addRedirect(adminId, { from: `/templates/${now}`, to: `/templates/${hub.slug}`, code: 301 }, { allowOwn: true });
  } else {
    await addRedirect(adminId, { from: `/templates/${now}`, to: `/templates/${want}`, code: 301 }, { allowOwn: true });
    if (now !== hub.slug) await addRedirect(adminId, { from: `/templates/${hub.slug}`, to: `/templates/${want}`, code: 301 }, { allowOwn: true });
    await removeRedirect(adminId, `/templates/${want}`); // a return to an earlier ending must not leave a redirect from it
  }
  return { ok: true };
}

/* The public address of a product, or null when it is in no category (then it has no public page). */
export async function publicProductPath(id: string): Promise<string | null> {
  const a = await allocation();
  const v = (await allHubViews()).find((x) => x.products.some((p) => p.id === id));
  return v ? hubProductPath(v.hub, a, id) : null;
}
