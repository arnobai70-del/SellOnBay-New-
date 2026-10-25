import 'server-only';
import { audit } from '../admin/audit';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';

/*
 * Search settings an admin can change at /dashboard/admin/seo without a deploy: the home page's title and description in Google, and the
 * verification codes Google Search Console and Bing Webmaster Tools ask for. Kept in `app_settings` under keys starting with "seo:".
 * Empty means "use the built-in words".
 */
export type SeoSettings = { homeTitle: string; homeDescription: string; googleVerification: string; bingVerification: string };
export type SeoKey = keyof SeoSettings;
export const SEO_DEFAULTS: SeoSettings = { homeTitle: '', homeDescription: '', googleVerification: '', bingVerification: '' };
export const SEO_LABEL: Record<SeoKey, string> = {
  homeTitle: 'Home page title in Google',
  homeDescription: 'Home page description in Google',
  googleVerification: 'Google Search Console code',
  bingVerification: 'Bing Webmaster Tools code',
};
const MAX: Record<SeoKey, number> = { homeTitle: 70, homeDescription: 170, googleVerification: 100, bingVerification: 100 };

/*
 * Search Console gives a whole tag (<meta name="google-site-verification" content="abc..." />); people paste either the tag or the code.
 * Keep only the code, and only characters such codes use.
 */
export const verificationCode = (raw: string) => {
  const m = raw.match(/content\s*=\s*["']([^"']+)["']/i);
  const code = (m ? m[1] : raw).trim();
  return /^[A-Za-z0-9_\-]{1,100}$/.test(code) ? code : null;
};

export function seoProblem(s: SeoSettings): string | null {
  for (const k of Object.keys(MAX) as SeoKey[]) if (typeof s[k] !== 'string' || s[k].length > MAX[k]) return `${SEO_LABEL[k]}: up to ${MAX[k]} characters.`;
  if (s.googleVerification && !verificationCode(s.googleVerification)) return 'The Google code can have only letters, numbers, - and _.';
  if (s.bingVerification && !verificationCode(s.bingVerification)) return 'The Bing code can have only letters, numbers, - and _.';
  return null;
}

const KEY = (k: SeoKey) => `seo:${k}`;
const mem: { saved: Partial<SeoSettings> } = ((globalThis as { __seoMem?: { saved: Partial<SeoSettings> } }).__seoMem ??= { saved: {} });
const g = globalThis as { __seoCache?: { at: number; value: SeoSettings } };
let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('app_settings').select('key').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

async function load(): Promise<SeoSettings> {
  const out = { ...SEO_DEFAULTS };
  let saved: Partial<SeoSettings> = mem.saved;
  if (await pg().catch(() => false)) {
    const { data } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in('key', (Object.keys(SEO_DEFAULTS) as SeoKey[]).map(KEY));
    saved = Object.fromEntries((data ?? []).map((r) => [String(r.key).slice(4), r.value]));
  }
  for (const k of Object.keys(SEO_DEFAULTS) as SeoKey[]) if (typeof saved[k] === 'string') out[k] = saved[k] as string;
  return seoProblem(out) ? { ...SEO_DEFAULTS } : out; // a bad saved value never breaks the pages
}

/* Read on the pages that need it, with a short cache. */
export async function getSeo(now = Date.now()): Promise<SeoSettings> {
  if (g.__seoCache && now - g.__seoCache.at < 30_000) return g.__seoCache.value;
  const value = await load();
  g.__seoCache = { at: now, value };
  return value;
}

export async function setSeo(adminId: string | null, patch: Partial<SeoSettings>): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  g.__seoCache = undefined;
  const before = await getSeo();
  const clean: Partial<SeoSettings> = {};
  for (const k of Object.keys(SEO_DEFAULTS) as SeoKey[]) {
    const v = patch[k];
    if (typeof v !== 'string') continue;
    clean[k] = (k === 'googleVerification' || k === 'bingVerification') && v.trim() ? (verificationCode(v) ?? v.trim()) : v.trim();
  }
  const next = { ...before, ...clean };
  const bad = seoProblem(next);
  if (bad) return { ok: false, status: 400, error: bad };
  const changed = (Object.keys(clean) as SeoKey[]).filter((k) => before[k] !== next[k]);
  if (!changed.length) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert(changed.map((k) => ({ key: KEY(k), value: next[k], changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() })));
    if (error) return { ok: false, status: 500, error: 'Could not save.' };
  } else for (const k of changed) mem.saved[k] = next[k];
  g.__seoCache = undefined;
  await audit(adminId, 'seo_changed', 'settings', changed.join(','), { from: Object.fromEntries(changed.map((k) => [k, before[k]])), to: Object.fromEntries(changed.map((k) => [k, next[k]])) });
  return { ok: true };
}
