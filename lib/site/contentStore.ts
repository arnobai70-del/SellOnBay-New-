import 'server-only';
import { recordRevision } from '../cms/history';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { createAdminClient } from '../supabase/server';
import { settingsTableReady } from '../seo/pageMeta';
import { seoPage } from '../seo/pageList';
import { cleanSocial, type SocialLink } from './social';
import { checkContact, mergeContact, type ContactRoutes } from './contact';
import { cleanCoupons, type Coupon } from '../marketing/coupons';
import { cleanBlocks, cleanFooter, cleanMenu, cleanSections, HOME_SECTIONS, type Block, type FooterColumn, type MenuItem, type SectionsConfig } from './content';

/*
 * What an admin builds in Admin > Site builder, kept in `app_settings` (no migration): the top menu ("site:menu"), the footer ("site:footer") and the
 * blocks of a page ("site:blocks:<path>"). Nothing saved means the site looks exactly as it did. Public pages read it with a short cache; saving refreshes them.
 */
type Kind = 'menu' | 'footer' | 'social';
const KEY = { menu: 'site:menu', footer: 'site:footer', social: 'site:social' } as const;
const BLOCKS = 'site:blocks:';
const SECTIONS = 'site:sections:';
const g = globalThis as { __siteMem?: Map<string, unknown>; __siteCache?: Map<string, { at: number; value: unknown }> };
const mem = (g.__siteMem ??= new Map<string, unknown>());
const cache = (g.__siteCache ??= new Map<string, { at: number; value: unknown }>());

async function read(key: string, now = Date.now()): Promise<unknown> {
  const hit = cache.get(key);
  if (now !== 0 && hit && now - hit.at < 30_000) return hit.value; // now = 0 asks for a fresh read (the admin pages)
  let value: unknown = mem.get(key) ?? null;
  try {
    if (await settingsTableReady()) {
      const { data } = await createAdminClient().from('app_settings').select('value').eq('key', key).maybeSingle();
      value = data?.value ?? null;
    }
  } catch {
    value = null; // a database problem never takes the menu, the footer or a page away
  }
  cache.set(key, { at: now, value });
  return value;
}

async function write(adminId: string | null, key: string, value: unknown | null, what: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  cache.delete(key);
  const before = await read(key, 0);
  const blank = (x: unknown) => x === null || (Array.isArray(x) && x.length === 0); // a reset row holds []
  if (JSON.stringify(before) === JSON.stringify(value) || (blank(before) && blank(value))) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (await settingsTableReady()) {
    const db = createAdminClient();
    // A reset saves an empty list instead of deleting the row: the server may not delete app_settings rows (migration 0040), and every reader
    // treats an empty list as "nothing saved", so the built-in menu, footer, sections or blocks show again (owner, 2026-11-08).
    const { error } = await db.from('app_settings').upsert({ key, value: value ?? [], changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save.' };
  } else if (value === null) mem.delete(key);
  else mem.set(key, value);
  cache.delete(key);
  await audit(adminId, what, 'settings', key, { from: before, to: value });
  await recordRevision(adminId, key, value, before); // CMS history (lib/cms)
  try {
    revalidatePath('/', 'layout'); // the menu and footer are on every page
  } catch {
    // outside a request (tests)
  }
  return { ok: true };
}

/* The footer's social media links (lib/site/social.ts); empty when none are saved. */
export async function savedSocial(now?: number): Promise<SocialLink[]> {
  const v = await read(KEY.social, now);
  return v === null ? [] : cleanSocial(v);
}

/* null: nothing saved, the built-in menu or footer is shown. */
export async function savedMenu(now?: number): Promise<MenuItem[] | null> {
  const v = await read(KEY.menu, now);
  const m = v === null ? [] : cleanMenu(v);
  return m.length ? m : null;
}
export async function savedFooter(now?: number): Promise<FooterColumn[] | null> {
  const v = await read(KEY.footer, now);
  const f = v === null ? [] : cleanFooter(v);
  return f.length ? f : null;
}
export async function pageBlocks(path: string): Promise<Block[]> {
  const v = await read(BLOCKS + path);
  return v === null ? [] : cleanBlocks(v);
}
/* Which pages have blocks saved (for the admin list). */
export async function pagesWithBlocks(): Promise<string[]> {
  const out = new Set<string>([...mem.keys()].filter((k) => k.startsWith(BLOCKS)).map((k) => k.slice(BLOCKS.length)));
  try {
    if (await settingsTableReady()) {
      const { data } = await createAdminClient().from('app_settings').select('key, value').like('key', `${BLOCKS}%`);
      for (const r of data ?? []) if (!(Array.isArray(r.value) && r.value.length === 0)) out.add(String(r.key).slice(BLOCKS.length)); // a reset page has []
    }
  } catch {
    // the list is only a help
  }
  return [...out];
}

/* The blocks set to "top" on every page that has any, for the slot above every page (one cached read for the whole site). */
export async function topBlocks(now = Date.now()): Promise<Record<string, Block[]>> {
  const hit = cache.get('__top');
  if (hit && now - hit.at < 30_000) return hit.value as Record<string, Block[]>;
  const out: Record<string, Block[]> = {};
  for (const path of await pagesWithBlocks()) {
    const top = (await pageBlocks(path)).filter((b) => b.position === 'top');
    if (top.length) out[path] = top;
  }
  cache.set('__top', { at: now, value: out });
  return out;
}

const HOME_KEYS = HOME_SECTIONS.map(([k]) => k);
export async function homeSections(): Promise<SectionsConfig> {
  const v = await read(SECTIONS + '/');
  return v === null ? { order: [], hidden: [] } : cleanSections(v, HOME_KEYS);
}

/* The home page, a listed page or a listing page can have blocks. */
export const blockablePath = (path: string) => path === '/' || !!seoPage(path) || /^\/product\/[A-Za-z0-9_-]{1,80}$/.test(path);

export async function saveSite(adminId: string | null, kind: Kind | 'blocks' | 'sections', value: unknown, path?: string) {
  if (kind === 'sections') {
    const cfg = cleanSections(value, HOME_KEYS);
    const empty = !cfg.order.length && !cfg.hidden.length;
    const r = await write(adminId, SECTIONS + '/', empty ? null : cfg, 'site_sections_changed');
    if (r.ok) {
      try {
        revalidatePath('/');
      } catch {
        // outside a request
      }
    }
    return r;
  }
  if (kind === 'blocks') {
    if (!path || !blockablePath(path)) return { ok: false as const, status: 404, error: 'That page cannot have blocks.' };
    const blocks = cleanBlocks(value);
    if (Array.isArray(value) && value.length > 0 && blocks.length === 0) return { ok: false as const, status: 400, error: 'No block was complete. Fill in the text, address or picture.' };
    const r = await write(adminId, BLOCKS + path, blocks.length ? blocks : null, 'site_blocks_changed');
    cache.delete('__top');
    if (r.ok) {
      try {
        revalidatePath(path);
      } catch {
        // outside a request
      }
    }
    return r;
  }
  if (kind === 'social') {
    const links = cleanSocial(value);
    if (typeof value === 'string' && value.trim() && !links.length)
      return { ok: false as const, status: 400, error: 'Write one "network https-address" per line, for example: instagram https://instagram.com/sellonbay' };
    return write(adminId, KEY.social, links.length ? links : null, 'site_social_changed');
  }
  if (kind === 'menu') {
    const m = cleanMenu(value);
    if (Array.isArray((value as { items?: unknown })?.items ?? value) && ((value as { items?: unknown[] })?.items ?? (value as unknown[])).length > 0 && m.length === 0)
      return { ok: false as const, status: 400, error: 'Every menu item needs a name and an address (a path like /faq or an https address).' };
    return write(adminId, KEY.menu, m.length ? m : null, 'site_menu_changed');
  }
  const f = cleanFooter(value);
  return write(adminId, KEY.footer, f.length ? f : null, 'site_footer_changed');
}

/* The contact addresses (owner, 2026-11-08), saved over the defaults in lib/emailRouting.ts. A database problem falls back to the defaults. */
export async function contactRoutes(now?: number): Promise<ContactRoutes> {
  return mergeContact(await read('site:contact', now));
}
export async function saveContact(adminId: string | null, value: unknown) {
  const c = checkContact(value);
  if (!c.ok) return { ok: false as const, status: 400, error: c.error };
  // An empty object, not a delete: the server may not delete app_settings rows (migration 0040), and {} reads as the defaults.
  return write(adminId, 'site:contact', c.value, 'contact_addresses_changed');
}

/* Coupons (Admin › Marketing; lib/marketing/coupons.ts). Saving replaces the whole list. */
export async function savedCoupons(now?: number): Promise<Coupon[]> {
  return cleanCoupons(await read('marketing:coupons', now));
}
export async function saveCoupons(adminId: string | null, list: Coupon[]) {
  return write(adminId, 'marketing:coupons', list, 'coupons_changed'); // [] rather than a delete (no delete right on app_settings, migration 0040)
}
