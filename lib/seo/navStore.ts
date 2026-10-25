import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { MARKET_MENU, type MenuEntry } from '../marketMenu';
import { applyNav, cleanNav, NAV_DEFAULT, type NavConfig } from '../navConfig';
import { createAdminClient } from '../supabase/server';
import { menuToEntries } from '../site/content';
import { savedMenu } from '../site/contentStore';
import { settingsTableReady } from './pageMeta';

/* The saved top-bar choices, in `app_settings` under "seo:nav" (no migration). Public pages read it with a short cache; saving refreshes the pages. */
const KEY = 'seo:nav';
const KNOWN = MARKET_MENU.map((e) => e.key);
const mem: { saved: NavConfig } = ((globalThis as { __navMem?: { saved: NavConfig } }).__navMem ??= { saved: NAV_DEFAULT });
const g = globalThis as { __navCache?: { at: number; value: NavConfig } };

export async function navConfig(now = Date.now()): Promise<NavConfig> {
  if (g.__navCache && now - g.__navCache.at < 30_000) return g.__navCache.value;
  let value = mem.saved;
  try {
    if (await settingsTableReady()) {
      const { data } = await createAdminClient().from('app_settings').select('value').eq('key', KEY).maybeSingle();
      value = cleanNav(data?.value, KNOWN);
    }
  } catch {
    value = NAV_DEFAULT; // a database problem never empties the menu
  }
  g.__navCache = { at: now, value };
  return value;
}

/* The menu the top bar shows now. */
export async function navMenu(): Promise<MenuEntry[]> {
  // A menu built in Admin > Site builder replaces the built-in one; without it the categories and their hide and order choices apply as before.
  const own = await savedMenu();
  if (own) return menuToEntries(own);
  return applyNav(MARKET_MENU, await navConfig());
}

export async function setNavConfig(adminId: string | null, v: NavConfig): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const next = cleanNav(v, KNOWN);
  if (next.order.length !== v.order.length || next.hidden.length !== v.hidden.length) return { ok: false, status: 400, error: 'Unknown menu entry.' };
  g.__navCache = undefined;
  const before = await navConfig(0);
  if (JSON.stringify(before) === JSON.stringify(next)) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (await settingsTableReady()) {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert({ key: KEY, value: next, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save.' };
  } else mem.saved = next;
  g.__navCache = undefined;
  await audit(adminId, 'seo_nav_changed', 'settings', KEY, { from: before, to: next });
  try {
    revalidatePath('/', 'layout'); // every page shows the top bar
  } catch {
    // outside a request (tests)
  }
  return { ok: true };
}
