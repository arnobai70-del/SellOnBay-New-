import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { createAdminClient } from '../supabase/server';
import { settingsTableReady } from '../seo/pageMeta';
import { seoPage } from '../seo/pageList';
import { cleanBlocks, cleanFooter, cleanMenu, cleanSections, HOME_SECTIONS, type Block, type FooterColumn, type MenuItem, type SectionsConfig } from './content';

/*
 * What an admin builds in Admin > Site builder, kept in `app_settings` (no migration): the top menu ("site:menu"), the footer ("site:footer") and the
 * blocks of a page ("site:blocks:<path>"). Nothing saved means the site looks exactly as it did. Public pages read it with a short cache; saving refreshes them.
 */
type Kind = 'menu' | 'footer';
const KEY = { menu: 'site:menu', footer: 'site:footer' } as const;
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
  if (JSON.stringify(before) === JSON.stringify(value)) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (await settingsTableReady()) {
    const db = createAdminClient();
    const { error } =
      value === null
        ? await db.from('app_settings').delete().eq('key', key)
        : await db.from('app_settings').upsert({ key, value, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save.' };
  } else if (value === null) mem.delete(key);
  else mem.set(key, value);
  cache.delete(key);
  await audit(adminId, what, 'settings', key, { from: before, to: value });
  try {
    revalidatePath('/', 'layout'); // the menu and footer are on every page
  } catch {
    // outside a request (tests)
  }
  return { ok: true };
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
      const { data } = await createAdminClient().from('app_settings').select('key').like('key', `${BLOCKS}%`);
      for (const r of data ?? []) out.add(String(r.key).slice(BLOCKS.length));
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
  if (kind === 'menu') {
    const m = cleanMenu(value);
    if (Array.isArray((value as { items?: unknown })?.items ?? value) && ((value as { items?: unknown[] })?.items ?? (value as unknown[])).length > 0 && m.length === 0)
      return { ok: false as const, status: 400, error: 'Every menu item needs a name and an address (a path like /faq or an https address).' };
    return write(adminId, KEY.menu, m.length ? m : null, 'site_menu_changed');
  }
  const f = cleanFooter(value);
  return write(adminId, KEY.footer, f.length ? f : null, 'site_footer_changed');
}
