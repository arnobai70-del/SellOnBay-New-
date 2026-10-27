import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { approveRefund, cancelRefund, markRefundPaid } from '@/lib/payments/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.union([
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('paid'), method: z.string().max(80), reference: z.string().max(120) }),
  z.object({ action: z.literal('cancel'), reason: z.string().max(1000) }),
]);

/* Finance approves a refund, records that the money went back, or cancels a refund request (F-5). Audited. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  try {
    const r =
      d.action === 'approve'
        ? await approveRefund(a.id, id)
        : d.action === 'paid'
          ? await markRefundPaid(a.id, id, { method: d.method, reference: d.reference })
          : await cancelRefund(a.id, id, d.reason);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
