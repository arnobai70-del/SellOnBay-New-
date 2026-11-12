import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { audit } from '@/lib/admin/audit';
import { exportCsv } from '@/lib/affiliates/service';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* Admin › Affiliate Management › Reports: one row per affiliate (no customer data), as CSV. Finance or Super; the download is audited. */
export async function GET() {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly(['finance', 'super']);
  if (!a.ok) return a.res;
  const csv = await exportCsv();
  await audit(a.id, 'affiliates_exported', 'affiliates', 'csv');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="affiliates-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
