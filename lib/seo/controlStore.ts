import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { forgetLiveProducts } from '../catalog';
import { forgetClosedProducts } from './closed';
import { createAdminClient } from '../supabase/server';
import { cleanControls, controlsProblem, DEFAULT_CONTROLS, isLocked, type PageControls } from './controls';
import { listingPage } from './listingMeta';
import { seoPage } from './pageList';
import { settingsTableReady } from './pageMeta';

/*
 * Publishing and search settings per public page, kept in `app_settings` under "seo:ctl:<path>" (no new table, nothing to migrate).
 * A page with no saved record is published, indexable and in the sitemap, exactly as before. Every change is audited with both versions,
 * so an earlier state can be put back from the audit log.
 */
const KEY = (path: string) => `seo:ctl:${path}`;
const mem: { saved: Record<string, PageControls> } = ((globalThis as { __pageCtlMem?: { saved: Record<string, PageControls> } }).__pageCtlMem ??= { saved: {} });
const g = globalThis as { __pageCtlCache?: { at: number; value: Record<string, PageControls> } };

/* Every saved record, by path, with a short cache. */
export async function allControls(now = Date.now()): Promise<Record<string, PageControls>> {
  if (g.__pageCtlCache && now - g.__pageCtlCache.at < 30_000) return g.__pageCtlCache.value;
  let value: Record<string, PageControls> = { ...mem.saved };
  if (await settingsTableReady().catch(() => false)) {
    const { data } = await createAdminClient().from('app_settings').select('key, value').like('key', 'seo:ctl:%');
    value = Object.fromEntries((data ?? []).map((r) => [String(r.key).slice('seo:ctl:'.length), cleanControls(r.value)]));
  }
  g.__pageCtlCache = { at: now, value };
  return value;
}

export async function pageControls(path: string): Promise<PageControls> {
  return (await allControls())[path] ?? DEFAULT_CONTROLS;
}

export async function setPageControls(adminId: string | null, path: string, v: PageControls): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (path !== '/' && !seoPage(path) && !(await listingPage(path))) return { ok: false, status: 404, error: 'That page cannot be changed here.' };
  const next = cleanControls(v);
  const bad = controlsProblem(v);
  if (bad) return { ok: false, status: 400, error: bad };
  if (isLocked(path) && next.status !== 'published') return { ok: false, status: 400, error: 'Legal and support pages must stay published.' };
  g.__pageCtlCache = undefined;
  const before = (await allControls())[path] ?? DEFAULT_CONTROLS;
  if (JSON.stringify(before) === JSON.stringify(next)) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (await settingsTableReady()) {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert({ key: KEY(path), value: next, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save.' };
  } else mem.saved[path] = next;
  g.__pageCtlCache = undefined;
  forgetClosedProducts();
  forgetLiveProducts();
  await audit(adminId, 'seo_controls_changed', 'settings', path, { from: before, to: next });
  try {
    revalidatePath(path.split('?')[0]);
    revalidatePath('/sitemap.xml');
  } catch {
    // outside a request (tests): nothing is cached to refresh
  }
  return { ok: true };
}
