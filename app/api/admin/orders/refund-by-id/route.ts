import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { refundOrder } from '@/lib/payments/service';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ orderId: z.uuid(), reason: z.string().max(1000) });

/* The same as /api/admin/orders/[id]/refund, for the form on the Payments page where the order id is typed in. Finance only. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  try {
    const r = await refundOrder(a.id, body.data.orderId, body.data.reason);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
