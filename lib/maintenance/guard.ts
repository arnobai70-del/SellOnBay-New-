import { NextResponse } from 'next/server';
import { MODULES, moduleOfApi, moduleOfPage, type ModuleKey } from './config';
import { closedRow, retryAfterSeconds, shownMessage, type ModuleRow } from './state';

/*
 * What a closed module answers. APIs get 503 with Retry-After and a short JSON body; pages show /maintenance/<module> (also 503, so search
 * engines keep the page and come back). Used by proxy.ts for every request and by the server guards in the routes (lib/maintenance/service.ts).
 */
export const maintenancePage = (key: ModuleKey) => `/maintenance/${key}`;

export function maintenanceJson(row: ModuleRow, now = Date.now()): NextResponse {
  const retry = retryAfterSeconds(row, now);
  return NextResponse.json(
    { error: shownMessage(row), maintenance: { module: row.key, label: MODULES[row.key].label, until: row.endAt ? new Date(row.endAt).toISOString() : null } },
    { status: 503, headers: { 'retry-after': String(retry), 'cache-control': 'no-store' } },
  );
}

/*
 * The notice for a page of a closed module, answered by proxy.ts itself with a real 503. A rewrite to /maintenance/<module> cannot carry the
 * status (Next 16 renders the rewritten page with 200), so the proxy writes this small self-contained page; /maintenance/<module> stays for
 * direct visits. Every text is escaped: the message is written by an admin, but it is still never treated as HTML.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function maintenanceHtml(row: ModuleRow): string {
  const m = MODULES[row.key];
  const until = row.endAt
    ? `<p class="u">Planned to be back by <time datetime="${new Date(row.endAt).toISOString()}">${esc(new Date(row.endAt).toUTCString().replace(/:\d\d GMT$/, ' UTC'))}</time>.</p>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Back soon</title><style>body{margin:0;background:#F3F5FA;color:#0F1330;font-family:"Plus Jakarta Sans",system-ui,sans-serif;line-height:1.55}main{max-width:640px;margin:56px auto;padding:0 16px}.c{background:#fff;border:1px solid #dfe3ee;border-radius:16px;padding:32px}h1{font-family:Poppins,system-ui,sans-serif;font-size:1.6rem;margin:0 0 10px}h2{font-size:1.05rem;margin:24px 0 6px}.u{color:#4a5070}a{display:inline-block;margin:24px 12px 0 0;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600;border:1px solid #2B3DFF;color:#2B3DFF}a.p{background:#2B3DFF;color:#fff}@media (max-width:640px){main{margin:32px auto}.c{padding:22px}}</style></head><body><main><div class="c" role="status"><h1>${esc(m.label)}: back soon</h1><p>${esc(shownMessage(row))}</p>${until}<h2>Still working</h2><p>${esc(m.keeps)}</p><a class="p" href="/">Go to the home page</a><a href="/faq">Help</a></div></main></body></html>`;
}
export function maintenancePageResponse(row: ModuleRow, now = Date.now()): NextResponse {
  return new NextResponse(maintenanceHtml(row), {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': String(retryAfterSeconds(row, now)), 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

/* For proxy.ts: the module this request belongs to and the row closing it, or null when the request may go on. */
export async function closedForPath(path: string, now = Date.now()): Promise<{ key: ModuleKey; row: ModuleRow; api: boolean } | null> {
  const api = path === '/api' || path.startsWith('/api/');
  const key = api ? moduleOfApi(path) : moduleOfPage(path);
  if (!key) return null;
  const row = await closedRow(key, now);
  return row ? { key, row, api } : null;
}
