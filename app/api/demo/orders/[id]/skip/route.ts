import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { demoSkip } from '@/lib/orders/service';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* Demo control only: jump to delivery, or skip the review window. Removed when real payments are connected. */
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o || !o.fundedAt) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const r = await demoSkip(o.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
