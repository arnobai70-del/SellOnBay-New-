import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { releaseRevision, returnRevision, triageRevision } from '@/lib/revisions/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('triage'), kind: z.enum(['defect', 'included', 'paid', 'feature', 'decline']), note: z.string().max(2000), requirements: z.string().max(8000).optional() }),
  z.object({ action: z.literal('release'), note: z.string().max(1000).default('') }),
  z.object({ action: z.literal('return'), reason: z.string().max(1000) }),
]);

/* Delivery or Support decides what a revision is; Delivery alone releases revised work or returns it to the seller. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly(['delivery', 'support']);
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  if (d.action !== 'triage' && !a.scopes.some((s) => s === 'delivery' || s === 'super')) return jsonT({ error: tx('Only Delivery can release or return work.') }, { status: 403 });
  try {
    const r =
      d.action === 'triage'
        ? await triageRevision(a.id, id, { kind: d.kind, note: d.note, requirements: d.requirements })
        : d.action === 'release'
          ? await releaseRevision(a.id, id, d.note)
          : await returnRevision(a.id, id, d.reason);
    return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return jsonT({ error: e.message }, { status: 503 });
    throw e;
  }
}
