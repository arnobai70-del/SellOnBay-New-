import 'server-only';
import { supabaseConfigured } from '../supabase/env';
import { createAdminClient } from '../supabase/server';

/*
 * The listings whose page an admin set to draft or archived (lib/seo/controlStore.ts). Public lists (home, shelves, search, related, category pages,
 * the sitemap) leave them out through lib/catalog.ts, so an unpublished listing is not found anywhere. Its orders, downloads and licences are
 * read by order, never from these lists, so past purchases keep working. Kept apart from controlStore so the catalogue can use it without a cycle.
 * A failed read leaves every listing visible: a database problem must never empty the shop.
 */
const PREFIX = 'seo:ctl:/product/';
const g = globalThis as { __closedCache?: { at: number; ids: Set<string> }; __pageCtlMem?: { saved: Record<string, { status?: string }> } };

export function forgetClosedProducts() {
  g.__closedCache = undefined;
}

export async function closedProducts(now = Date.now()): Promise<Set<string>> {
  if (g.__closedCache && now - g.__closedCache.at < 30_000) return g.__closedCache.ids;
  const ids = new Set<string>();
  for (const [path, v] of Object.entries(g.__pageCtlMem?.saved ?? {})) if (path.startsWith('/product/') && v.status && v.status !== 'published') ids.add(path.slice('/product/'.length));
  if (supabaseConfigured) {
    try {
      const { data } = await createAdminClient().from('app_settings').select('key, value').like('key', `${PREFIX}%`);
      for (const r of data ?? []) {
        const st = (r.value as { status?: string } | null)?.status;
        if (st === 'draft' || st === 'archived') ids.add(String(r.key).slice(PREFIX.length));
      }
    } catch {
      // keep every listing visible
    }
  }
  g.__closedCache = { at: now, ids };
  return ids;
}
