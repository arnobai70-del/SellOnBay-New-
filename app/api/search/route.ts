import { NextResponse } from 'next/server';
import { clientAddress } from '@/lib/clientIp';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { siteSearch } from '@/lib/siteSearch';
import { MAX_QUERY } from '@/lib/siteSearchCore';

export const runtime = 'nodejs';

/* GET /api/search?q=bakery  ->  the best few matches of each kind, for the box under the top search bar. Public and read-only. */
export async function GET(req: Request) {
  const closed = await maintenanceFor('catalog'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, MAX_QUERY);
  if (!(await limit(`search:${clientAddress(req.headers)}`, 90, 60_000))) return NextResponse.json({ error: 'Too many searches. Wait a moment.' }, { status: 429 });
  const hits = await siteSearch(q, 4);
  return NextResponse.json({ q, hits: hits.map(({ score: _s, ...h }) => h) }, { headers: { 'cache-control': 'no-store' } });
}
