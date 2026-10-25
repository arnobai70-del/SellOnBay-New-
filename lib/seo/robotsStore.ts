import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { createAdminClient } from '../supabase/server';
import { settingsTableReady } from './pageMeta';
import { cleanRobotsExtra, robotsPathProblem, ROBOTS_EXTRA_MAX } from './robotsRules';

/* The extra paths an admin keeps crawlers out of, in `app_settings` under "seo:robots" (no migration). robots.txt reads it on each request. */
const KEY = 'seo:robots';
const mem: { saved: string[] } = ((globalThis as { __robotsMem?: { saved: string[] } }).__robotsMem ??= { saved: [] });

export async function robotsExtra(): Promise<string[]> {
  try {
    if (await settingsTableReady()) {
      const { data } = await createAdminClient().from('app_settings').select('value').eq('key', KEY).maybeSingle();
      return cleanRobotsExtra(data?.value);
    }
  } catch {
    return []; // a database problem never blocks crawlers from the site
  }
  return mem.saved;
}

export async function setRobotsExtra(adminId: string | null, paths: string[]): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const list = paths.map((p) => p.trim()).filter(Boolean);
  if (list.length > ROBOTS_EXTRA_MAX) return { ok: false, status: 400, error: `At most ${ROBOTS_EXTRA_MAX} paths.` };
  for (const p of list) {
    const bad = robotsPathProblem(p);
    if (bad) return { ok: false, status: 400, error: `${p}: ${bad}` };
  }
  const next = cleanRobotsExtra(list);
  const before = await robotsExtra();
  if (JSON.stringify(before) === JSON.stringify(next)) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (await settingsTableReady()) {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert({ key: KEY, value: next, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save.' };
  } else mem.saved = next;
  await audit(adminId, 'seo_robots_changed', 'settings', KEY, { from: before, to: next });
  try {
    revalidatePath('/robots.txt');
  } catch {
    // outside a request (tests)
  }
  return { ok: true };
}
