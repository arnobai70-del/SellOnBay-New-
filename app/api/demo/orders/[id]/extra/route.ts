import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { createExtra } from '@/lib/orders/extra';
import { extraSchema } from '@/lib/schemas';
import { idOf, readJson } from '@/lib/validate';
import { guard } from '@/lib/guard';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* Demo only: the pretend seller of a starter listing sends an extra-work request, so the buyer side can be tried. Real sellers use /api/orders/[id]/extra. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!o.demo || o.sellerId) return NextResponse.json({ error: 'Not available.' }, { status: 403 });
  const parsed = await readJson(req, extraSchema);
  if (!parsed.ok) return parsed.res;
  const g = await guard('extra', null);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const r = await createExtra(o.id, null, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.request.id });
}
