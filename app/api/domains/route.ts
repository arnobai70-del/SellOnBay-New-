import { NextResponse } from 'next/server';
import { cleanName } from '@/lib/domains';
import { domainProvider, isLiveRegistrar } from '@/lib/providers/domain';
import { domainQuery } from '@/lib/schemas';
import { parseWith } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* GET /api/domains?name=mybakery  ->  availability and yearly price for each ending. Public and read-only. */
export async function GET(req: Request) {
  const closed = await maintenanceFor('catalog'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const q = parseWith(domainQuery, new URL(req.url).searchParams.get('name') ?? '', 'That name is too long.');
  if (!q.ok) return q.res;
  const name = cleanName(q.data);
  if (name.length < 2) return NextResponse.json({ error: 'Type at least 2 letters or numbers.' }, { status: 400 });
  const provider = domainProvider();
  if (provider.name === 'unconfigured') {
    return NextResponse.json(
      { error: 'Domain availability cannot be verified yet. No registrar is connected. Please use a domain you already own.', live: false, results: [] },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  try {
    return NextResponse.json(
      { name, live: isLiveRegistrar(provider), results: await provider.search(name) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Domain availability verification is temporarily unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
