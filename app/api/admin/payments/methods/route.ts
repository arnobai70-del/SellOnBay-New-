import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { saveMethodAsAdmin } from '@/lib/payments/service';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const onOff = z.union([z.boolean(), z.enum(['on', 'off']).transform((v) => v === 'on')]);
const schema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(['bank_transfer', 'local_wallet']),
  label: z.string().max(80),
  instructions: z.string().max(2000),
  currency: z.string().max(3).default('USD'),
  active: onOff.default(false),
  reason: z.string().max(500).default(''),
});

/* Finance adds or changes a payment method buyers can use (eligible business bank transfers and local wallets, F-4). Audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { reason, ...m } = body.data;
  try {
    const r = await saveMethodAsAdmin(a.id, m, reason);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
