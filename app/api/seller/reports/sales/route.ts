import { NextResponse } from 'next/server';
import { sellerOnly } from '@/lib/auth/guards';
import { exportSales } from '@/lib/reports/service';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';

/* A seller exports their own sales as PDFs (no buyer personal data in any row). Filters for other sellers are ignored. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await exportSales({ id: who.id, name: who.name, scope: 'seller' }, raw && typeof raw === 'object' ? raw : {});
  return r.ok
    ? NextResponse.json({ ok: true, batch: r.value.batchId, files: r.value.files.map((f) => ({ id: f.id, part: f.part, rows: f.rowCount })) })
    : jsonT({ error: r.error }, { status: r.status });
}
