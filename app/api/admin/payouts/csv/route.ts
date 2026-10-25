import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { exportPayouts, payoutsCsv, weekStartOf } from '@/lib/payouts';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/*
 * The week's payouts as a CSV for sending money by hand. Downloading locks the scheduled ones as "exported", so it is a POST (a form button):
 * a GET could be fired by a link or an image on another page. Payout details are the sellers' own and stay admin-only.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const week = new URL(req.url).searchParams.get('week') ?? weekStartOf(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return NextResponse.json({ error: 'Use a date like 2026-10-04.' }, { status: 400 });
  const rows = await exportPayouts(week, a.id);
  if (!rows.length) return NextResponse.json({ error: 'No payouts to export for that week.' }, { status: 404 });
  return new NextResponse(payoutsCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="payouts-${week}.csv"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
