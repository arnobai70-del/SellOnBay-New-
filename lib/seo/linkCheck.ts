import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { MARKET_MENU, menuLinks } from '../marketMenu';
import { createAdminClient } from '../supabase/server';
import { SITE_URL } from '../site';
import { settingsTableReady } from './pageMeta';
import { sitemapPlan } from './sitemapPlan';

/*
 * The link check: opens every address the sitemap lists and every address the top bar sends to, from this server, and records the answer.
 * A sitemap address that does not answer 200 is a problem (it should not be there); a menu link that does not answer is a broken link. The last
 * result is kept so the SEO hub can show it. Admin only, at most one run every 30 seconds, never follows redirects (a redirect is reported as one).
 */
export type LinkResult = { path: string; from: 'sitemap' | 'menu'; status: number };
export type LinkReport = { at: number; checked: number; ok: number; redirects: number; broken: LinkResult[]; redirected: LinkResult[] };

const KEY = 'seo:linkcheck';
const mem: { saved: LinkReport | null } = ((globalThis as { __linkMem?: { saved: LinkReport | null } }).__linkMem ??= { saved: null });
const MAX_URLS = 250;

export async function lastLinkReport(): Promise<LinkReport | null> {
  if (await settingsTableReady().catch(() => false)) {
    const { data } = await createAdminClient().from('app_settings').select('value').eq('key', KEY).maybeSingle();
    return (data?.value as LinkReport | undefined) ?? null;
  }
  return mem.saved;
}

/* Every address to check, once each, as paths. */
export async function addressesToCheck(): Promise<{ path: string; from: 'sitemap' | 'menu' }[]> {
  const out = new Map<string, 'sitemap' | 'menu'>();
  for (const e of await sitemapPlan()) out.set(e.path || '/', 'sitemap');
  for (const [, href] of menuLinks(MARKET_MENU)) if (href.startsWith('/') && !out.has(href)) out.set(href, 'menu');
  return [...out.entries()].slice(0, MAX_URLS).map(([path, from]) => ({ path, from }));
}

/* Is this origin one the check may call? The site's own address or a local one, so an odd Host header cannot aim the check elsewhere. */
export const allowedOrigin = (origin: string) => {
  try {
    const u = new URL(origin);
    return u.origin === new URL(SITE_URL).origin || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

export async function runLinkCheck(adminId: string | null, origin: string): Promise<{ ok: true; report: LinkReport } | { ok: false; status: number; error: string }> {
  if (!allowedOrigin(origin)) return { ok: false, status: 400, error: 'The check can only call this site.' };
  const prev = await lastLinkReport();
  if (prev && Date.now() - prev.at < 30_000) return { ok: false, status: 429, error: 'The check ran a moment ago. Wait 30 seconds.' };
  const list = await addressesToCheck();
  const results: LinkResult[] = [];
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const item = list[next++];
      let status = 0;
      try {
        const res = await fetch(new URL(item.path, origin), { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'SellOnBay-link-check' } });
        status = res.status;
      } catch {
        status = 0; // did not answer
      }
      results.push({ ...item, status });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  const report: LinkReport = {
    at: Date.now(),
    checked: results.length,
    ok: results.filter((r) => r.status >= 200 && r.status < 300).length,
    redirects: results.filter((r) => r.status >= 300 && r.status < 400).length,
    broken: results.filter((r) => r.status === 0 || r.status >= 400).slice(0, 100),
    redirected: results.filter((r) => r.status >= 300 && r.status < 400).slice(0, 100),
  };
  if (await settingsTableReady()) await createAdminClient().from('app_settings').upsert({ key: KEY, value: report, changed_at: new Date().toISOString() });
  else mem.saved = report;
  await audit(adminId, 'seo_link_check', 'settings', KEY, { checked: report.checked, broken: report.broken.length });
  try {
    revalidatePath('/dashboard/admin/seo');
  } catch {
    // outside a request (tests)
  }
  return { ok: true, report };
}
