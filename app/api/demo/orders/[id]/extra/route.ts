import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { createExtra } from '@/lib/orders/extra';
import { extraSchema } from '@/lib/schemas';
import { idOf, readJson } from '@/lib/validate';
import { guard } from '@/lib/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/* Demo only: the pretend seller of a starter listing sends an extra-work request, so the buyer side can be tried. Real sellers use /api/orders/[id]/extra. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return jsonT({ error: tx('Order not found.') }, { status: 404 });
  if (!o.demo || o.sellerId) return jsonT({ error: tx('Not available.') }, { status: 403 });
  const parsed = await readJson(req, extraSchema);
  if (!parsed.ok) return parsed.res;
  const g = await guard('extra', null);
  if (!g.ok) return jsonT({ error: g.error }, { status: g.status });
  const r = await createExtra(o.id, null, parsed.data);
  if (!r.ok) return jsonT({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.request.id });
}
