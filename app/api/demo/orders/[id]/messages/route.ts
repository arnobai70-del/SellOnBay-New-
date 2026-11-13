import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { listMessages, roleIn } from '@/lib/chat';
import { getViewerId } from '@/lib/supabase/viewer';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/* The buyer reads the old order chat (also without an account in demo mode). The seller uses /api/orders/[id]/messages. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o || !roleIn(o, (await getViewerId()) ?? null)) return jsonT({ error: tx('Order not found.') }, { status: 404 });
  const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || 0;
  return NextResponse.json({ messages: await listMessages(o.id, since), now: Date.now() }, { headers: { 'cache-control': 'no-store' } });
}

/*
 * SellOnBay 2.0 (owner decision D-B): buyers and sellers no longer write to each other. The old chat stays readable; new messages go to
 * SellOnBay through /api/conversations/order/<id>. The old sending code is in git history before SellOnBay 2.0.
 */
export async function POST() {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  return jsonT({ error: tx('Messages now go through SellOnBay. Use "Messages with SellOnBay" on the order.') }, { status: 410 });
}
