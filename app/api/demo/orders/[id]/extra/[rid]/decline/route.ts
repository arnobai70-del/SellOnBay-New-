import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { declineExtra, getExtra } from '@/lib/orders/extra';
import { getViewerId } from '@/lib/supabase/viewer';
import { idOf, idParam } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* The buyer declines extra work. Nothing is charged. */
export async function POST(_r: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const rid = idParam.safeParse((await params).rid);
  const c = rid.success ? await getExtra(rid.data) : null;
  if (!c || c.orderId !== o.id) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  const r = await declineExtra(c.id, (await getViewerId()) ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
