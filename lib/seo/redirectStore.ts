import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { createAdminClient } from '../supabase/server';
import { SEO_PAGES } from './pageList';
import { HUBS, hubPath } from './hubs';
import { settingsTableReady } from './pageMeta';
import { forgetRedirects, redirectMem, savedRedirects } from './redirectRead';
import { REDIRECT_MAX, normalizeFrom, redirectProblem, type Redirect } from './redirectsCore';

const KEY = 'seo:redirects';
type Result = { ok: true } | { ok: false; status: number; error: string };

/* The addresses of the site's own pages: a redirect from one of them would hide a live page. */
const ownPaths = () => ['/', ...SEO_PAGES.map((p) => p.path.split('?')[0]), ...HUBS.map(hubPath)];

export const listRedirects = () => savedRedirects(0);

async function write(adminId: string | null, next: Redirect[], what: string, ref: string, before: Redirect[]): Promise<Result> {
  if (await settingsTableReady()) {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert({ key: KEY, value: next, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save.' };
  } else redirectMem.list = next;
  forgetRedirects();
  await audit(adminId, what, 'settings', ref, { from: before, to: next });
  try {
    revalidatePath('/sitemap.xml');
  } catch {
    // outside a request (tests)
  }
  return { ok: true };
}

export async function addRedirect(adminId: string | null, r: Redirect, opts: { allowOwn?: boolean } = {}): Promise<Result> {
  const before = await listRedirects();
  const from = normalizeFrom(r.from);
  if (before.length >= REDIRECT_MAX && !before.some((x) => x.from === from)) return { ok: false, status: 400, error: `At most ${REDIRECT_MAX} redirects.` };
  const bad = redirectProblem(before, { ...r, from }, opts.allowOwn ? [] : ownPaths());
  if (bad) return { ok: false, status: 400, error: bad };
  const next = [...before.filter((x) => x.from !== from), { from, to: r.to.trim(), code: r.code }];
  if (JSON.stringify(next) === JSON.stringify(before)) return { ok: false, status: 409, error: 'Nothing changed.' };
  return write(adminId, next, 'seo_redirect_saved', from, before);
}

export async function removeRedirect(adminId: string | null, from: string): Promise<Result> {
  const before = await listRedirects();
  const f = normalizeFrom(from);
  if (!before.some((x) => x.from === f)) return { ok: false, status: 404, error: 'No such redirect.' };
  return write(
    adminId,
    before.filter((x) => x.from !== f),
    'seo_redirect_removed',
    f,
    before,
  );
}
