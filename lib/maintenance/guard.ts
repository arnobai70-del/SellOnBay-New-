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

/* For proxy.ts: the module this request belongs to and the row closing it, or null when the request may go on. */
export async function closedForPath(path: string, now = Date.now()): Promise<{ key: ModuleKey; row: ModuleRow; api: boolean } | null> {
  const api = path === '/api' || path.startsWith('/api/');
  const key = api ? moduleOfApi(path) : moduleOfPage(path);
  if (!key) return null;
  const row = await closedRow(key, now);
  return row ? { key, row, api } : null;
}
