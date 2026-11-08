import { NextResponse } from 'next/server';
import { MODULES, moduleOfApi, moduleOfPage, type ModuleKey } from './config';
import { closedPage, closedRow, retryAfterSeconds, shownMessage, type ModuleRow, type PageRow } from './state';

/*
 * What a closed area answers: a module, one page by its address, or the whole site (owner, 2026-11-08). APIs get 503 with Retry-After and a
 * short JSON body; pages get the maintenance notice, also 503, so search engines keep the page and come back. Used by proxy.ts for every
 * request and by the server guards in the routes (lib/maintenance/service.ts).
 */
export const maintenancePage = (key: ModuleKey) => `/maintenance/${key}`;

export type Closure = { key: string; module: ModuleKey | null; label: string; keeps: string; message: string; endAt: number | null };
export const fromModule = (r: ModuleRow): Closure => ({ key: r.key, module: r.key, label: MODULES[r.key].label, keeps: MODULES[r.key].keeps, message: shownMessage(r), endAt: r.endAt });
export const fromPage = (r: PageRow): Closure => ({
  key: `page:${r.path}`,
  module: null,
  label: 'This page',
  keeps: 'Every other page of the site.',
  message: r.message.trim() || 'This page is being updated for a short while. Everything else on the site works as usual.',
  endAt: r.endAt,
});

export function maintenanceJson(c: Closure, now = Date.now()): NextResponse {
  return NextResponse.json(
    { error: c.message, maintenance: { module: c.key, label: c.label, until: c.endAt ? new Date(c.endAt).toISOString() : null } },
    { status: 503, headers: { 'retry-after': String(retryAfterSeconds(c, now)), 'cache-control': 'no-store' } },
  );
}

/*
 * The notice for a closed page, answered by proxy.ts itself with a real 503. A rewrite cannot carry the status (Next 16 renders the rewritten
 * page with 200), so the proxy writes this small self-contained page in the glass look; /maintenance/<module> stays for direct visits. Every text
 * is escaped: the message is written by an admin, but it is still never treated as HTML.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function maintenanceHtml(c: Closure): string {
  const until = c.endAt
    ? `<p class="u">Planned to be back by <time datetime="${new Date(c.endAt).toISOString()}">${esc(new Date(c.endAt).toUTCString().replace(/:\d\d GMT$/, ' UTC'))}</time>.</p>`
    : '';
  const home = c.module === 'site' ? '' : '<a class="p" href="/">Go to the home page</a><a href="/help">Help</a>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Back soon</title><style>body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 10% -10%,#dff1ea,transparent),radial-gradient(900px 500px at 110% 10%,#dde9f4,transparent),#edf3f6;color:#2b4250;font-family:Inter,system-ui,sans-serif;line-height:1.55}main{max-width:620px;margin:64px auto;padding:0 16px}.c{background:rgba(255,255,255,.62);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.95);border-radius:20px;box-shadow:0 10px 30px rgba(43,66,80,.06);padding:32px}h1{font-weight:500;font-size:1.6rem;letter-spacing:-.01em;margin:0 0 10px}h2{font-weight:500;font-size:1.05rem;margin:24px 0 6px}.u{color:#566c78}a{display:inline-flex;align-items:center;min-height:44px;box-sizing:border-box;margin:24px 12px 0 0;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:500;border:1px solid #dce7ec;color:#2b4250;background:rgba(255,255,255,.7)}a.p{background:#cdebdf;border-color:#cdebdf;color:#1a5444}@media (max-width:640px){main{margin:32px auto}.c{padding:22px}}</style></head><body><main><div class="c" role="status"><h1>${esc(c.label)}: back soon</h1><p>${esc(c.message)}</p>${until}<h2>Still working</h2><p>${esc(c.keeps)}</p>${home}</div></main></body></html>`;
}
export function maintenancePageResponse(c: Closure, now = Date.now()): NextResponse {
  return new NextResponse(maintenanceHtml(c), {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': String(retryAfterSeconds(c, now)), 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

/* While the whole site is closed these still work, so it can be opened again: signing in, the admin dashboards and their APIs, and the always-on routes. */
const SITE_KEEPS = [/^\/(admin|dashboard\/admin)(\/|$)/, /^\/api\/(admin|account)(\/|$)/, /^\/(login|signin|two-factor|verify-email|forgot-password|auth|maintenance)(\/|$)/];

/* For proxy.ts: what closes this request (the whole site, a page rule, or its module), or null when the request may go on. */
export async function closedForPath(path: string, now = Date.now()): Promise<{ key: string; module: ModuleKey | null; closure: Closure; api: boolean } | null> {
  const api = path === '/api' || path.startsWith('/api/');
  const key = api ? moduleOfApi(path) : moduleOfPage(path);
  const alwaysOn = api && /^\/api\/(webhooks|paypal\/return|cron|health|admin\/maintenance)(\/|$)/.test(path); // money moving and the way back
  if (!alwaysOn && !SITE_KEEPS.some((re) => re.test(path))) {
    const site = await closedRow('site', now);
    if (site) return { key: 'site', module: 'site', closure: fromModule(site), api };
  }
  if (!api) {
    const page = await closedPage(path, now);
    if (page && !/^\/(admin|dashboard\/admin|signin|two-factor|maintenance)(\/|$)/.test(path)) return { key: `page:${page.path}`, module: null, closure: fromPage(page), api };
  }
  if (!key) return null;
  const row = await closedRow(key, now);
  return row ? { key, module: key, closure: fromModule(row), api } : null;
}
