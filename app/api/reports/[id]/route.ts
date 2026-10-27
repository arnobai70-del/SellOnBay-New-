import { NextResponse } from 'next/server';
import { participant } from '@/lib/auth/guards';
import { downloadExport } from '@/lib/reports/service';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* Downloads a generated report again while it is kept (24 hours). Only the person who made it, whatever their role. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await participant();
  if (!who.ok) return who.res;
  const r = await downloadExport(who.viewer.id, await idOf(params));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return new NextResponse(new Uint8Array(r.value.bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${r.value.name}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
}
