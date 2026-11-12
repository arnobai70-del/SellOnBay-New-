import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { cancel, refundAtProvider } from '@/lib/orders/service';
import { getViewerId } from '@/lib/supabase/viewer';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/* The buyer cancels: any time before paying, or after the delivery time has passed (overdue) with a full refund. */
export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return jsonT({ error: tx('Order not found.') }, { status: 404 });
  if (o.state !== 'awaiting_payment' && o.state !== 'overdue') return jsonT({ error: tx('This order cannot be cancelled now.') }, { status: 409 });
  const wasPaid = !!o.fundedAt;
  const r = await cancel(o.id, (await getViewerId()) ?? null, wasPaid ? 'buyer cancelled an overdue order' : 'buyer cancelled before paying');
  if (!r.ok) return jsonT({ error: r.error }, { status: r.status });
  if (wasPaid) await refundAtProvider(o); // the price and any funded extra work, as the ledger gives back
  return NextResponse.json({ ok: true, refunded: wasPaid });
}
