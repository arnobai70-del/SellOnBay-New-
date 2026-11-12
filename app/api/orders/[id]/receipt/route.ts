import { NextResponse } from 'next/server';
import { buyerOnly } from '@/lib/auth/guards';
import { buyerReceipt } from '@/lib/reports/service';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';

/* The buyer's receipt (PDF) for one of their paid orders. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await buyerOnly();
  if (!who.ok) return who.res;
  const r = await buyerReceipt(who.id, await idOf(params));
  if (!r.ok) return jsonT({ error: r.error }, { status: r.status });
  return new NextResponse(new Uint8Array(r.value.bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${r.value.name}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
}
