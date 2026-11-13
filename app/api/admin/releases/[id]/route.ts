import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { approveLegacyRelease, approveRelease, authoriseWork, cancelLegacyUnpaid, entitlementAction, returnToSeller } from '@/lib/release/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = z.object({
  action: z.enum(['authorise', 'approve', 'return', 'suspend', 'resume', 'revoke', 'legacy_approve', 'legacy_cancel']),
  note: z.string().max(1000).default(''),
});

/* Delivery (or Super, F-12) decides releases: authorise work, approve or return a delivery, change a buyer's access, review legacy orders. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('delivery');
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { action, note } = body.data;
  try {
    const r =
      action === 'authorise'
        ? await authoriseWork(a.id, id)
        : action === 'approve'
          ? await approveRelease(a.id, id, note)
          : action === 'return'
            ? await returnToSeller(a.id, id, note)
            : action === 'legacy_approve'
              ? await approveLegacyRelease(a.id, id, note)
              : action === 'legacy_cancel'
                ? await cancelLegacyUnpaid(a.id, id, note)
                : await entitlementAction(a.id, id, action, note);
    return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return jsonT({ error: e.message }, { status: 503 });
    throw e;
  }
}
