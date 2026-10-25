import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { buildReport, savedReport } from '@/lib/analytics';
import { reportCsv } from '@/lib/analyticsCore';
import { METRIC_LABEL } from '@/lib/metrics';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* One day's visitor report as a CSV (the stored one, or built now for a day that has none yet, such as today). Admins only. */
export async function GET(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const day = new URL(req.url).searchParams.get('day') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) return NextResponse.json({ error: 'Use a date like 2026-10-21.' }, { status: 400 });
  const r = (await savedReport(day)) ?? (await buildReport(day));
  return new NextResponse(reportCsv(r, METRIC_LABEL), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="visitors-${day}.csv"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
