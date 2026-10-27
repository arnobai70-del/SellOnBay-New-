import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { exporterName, exportSales } from '@/lib/reports/service';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* Finance (or Super) exports all sales as PDFs: at most 1,000 rows per file, kept 24 hours, every file logged. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await exportSales({ id: a.id ?? 'demo-admin', name: await exporterName(a.id), scope: 'admin' }, raw && typeof raw === 'object' ? raw : {});
  return r.ok
    ? NextResponse.json({ ok: true, batch: r.value.batchId, files: r.value.files.map((f) => ({ id: f.id, part: f.part, rows: f.rowCount })) })
    : NextResponse.json({ error: r.error }, { status: r.status });
}
