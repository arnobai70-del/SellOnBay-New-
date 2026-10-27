import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { reconcile, rejectPayment } from '@/lib/payments/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.union([
  z.object({ action: z.literal('reconcile'), amountReceived: z.coerce.number(), statementRef: z.string().max(120), receivedOn: z.string().max(30), note: z.string().max(1000).optional() }),
  z.object({ action: z.literal('reject'), reason: z.string().max(1000) }),
]);

/* Finance reconciles a reported payment against the money that actually arrived, or rejects it. Audited before anything changes. */
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
    if (d.action === 'reject') {
      const r = await rejectPayment(a.id, id, d.reason);
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
    }
    const receivedAt = Date.parse(d.receivedOn.length === 10 ? `${d.receivedOn}T12:00:00Z` : d.receivedOn);
    const r = await reconcile(a.id, id, { amountReceivedCents: Math.round(d.amountReceived * 100), statementRef: d.statementRef, receivedAt, note: d.note });
    return r.ok ? NextResponse.json({ ok: true, funded: r.value.funded, short: r.value.shortCents, excess: r.value.excessCents }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
