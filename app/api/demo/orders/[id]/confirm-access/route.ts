import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { confirmAccess } from '@/lib/orders/service';
import { getViewerId } from '@/lib/supabase/viewer';
import { idOf } from '@/lib/validate';
import { HELD_TEXT, heldReason } from '@/lib/holds';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* The buyer says they can open the repository the seller invited them to. The review window starts now. */
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (await heldReason(o.id)) return NextResponse.json({ error: HELD_TEXT }, { status: 409 });
  const r = await confirmAccess(o.id, (await getViewerId()) ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
