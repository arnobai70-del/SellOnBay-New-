import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { REVIEW_CHECKLIST, retryChecks, reviewFile, type ChecklistKey } from '@/lib/files/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
export const maxDuration = 300;
const tick = z.union([z.boolean(), z.literal('on').transform(() => true)]).optional();
const schema = z.object({
  decision: z.enum(['approve', 'reject', 'retry']),
  note: z.string().max(1000).default(''),
  label: z.string().max(30).optional(),
  changelog: z.string().max(2000).optional(),
  ...(Object.fromEntries(Object.keys(REVIEW_CHECKLIST).map((k) => [k, tick])) as Record<ChecklistKey, typeof tick>),
});

/* A Catalog admin reviews a source file that passed the automatic checks: approve (checklist, version label), reject, or run the checks again. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('catalog');
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  try {
    const r =
      d.decision === 'retry'
        ? await retryChecks(a.id, id)
        : await reviewFile(a.id, id, d.decision, {
            note: d.note,
            label: d.label,
            changelog: d.changelog,
            checklist: Object.fromEntries((Object.keys(REVIEW_CHECKLIST) as ChecklistKey[]).map((k) => [k, d[k] === true])),
          });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
