import { NextResponse } from 'next/server';
import { clientAddress } from '@/lib/clientIp';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { smartSearch } from '@/lib/glass/search';
import { MAX_QUERY } from '@/lib/siteSearchCore';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/* GET /api/search?q=bakery  ->  the best few matches of each kind, for the box under the top search bar. Public and read-only. */
export async function GET(req: Request) {
  const closed = await maintenanceFor('search'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, MAX_QUERY);
  if (!(await limit(`search:${clientAddress(req.headers)}`, 90, 60_000))) return jsonT({ error: tx('Too many searches. Wait a moment.') }, { status: 429 });
  // The glass site: grouped smart search (lib/glass/search.ts). Test servers on the old public site keep the old answer.
  return NextResponse.json(await smartSearch(q, 5), { headers: { 'cache-control': 'no-store' } });
}
