import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { ADMIN_SUB_ACTIONS, adminSubscriptionAction } from '@/lib/plans/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = z.object({
  action: z.enum(ADMIN_SUB_ACTIONS),
  reason: z.string().max(500).default(''),
  paymentRef: z.string().max(100).optional(),
  periodDays: z.coerce.number().optional(),
});

/* Finance moves a seller subscription, case by case (O-4). Activation and renewal need the reconciled payment reference. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  try {
    const r = await adminSubscriptionAction(a.id, id, body.data.action, { reason: body.data.reason, paymentRef: body.data.paymentRef, periodDays: body.data.periodDays });
    return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return jsonT({ error: e.message }, { status: 503 });
    throw e;
  }
}
