import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { isDocKey } from '@/lib/legal/rules';
import { deleteDraft, publishLegal, recordReview, saveDraft } from '@/lib/legal/service';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    id: z
      .uuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    docKey: z.string().max(40),
    title: z.string().max(200),
    body: z.string().max(200_000),
    summary: z.string().max(600).default(''),
  }),
  z.object({ action: z.literal('review'), id: z.uuid(), note: z.string().max(600) }),
  z.object({ action: z.literal('publish'), id: z.uuid(), reason: z.string().max(600) }),
  z.object({ action: z.literal('delete'), id: z.uuid() }),
]);

/* Legal documents (lib/legal). Content admins write and delete drafts; only a Super Admin records a lawyer review or publishes. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  if ((d.action === 'review' || d.action === 'publish') && !a.scopes.includes('super')) return NextResponse.json({ error: 'Only a Super Admin can do this.' }, { status: 403 });
  try {
    const r =
      d.action === 'save'
        ? isDocKey(d.docKey)
          ? await saveDraft(a.id, { id: d.id, docKey: d.docKey, title: d.title, body: d.body, summary: d.summary })
          : ({ ok: false, status: 404, error: 'Unknown document.' } as const)
        : d.action === 'review'
          ? await recordReview(a.id, d.id, d.note)
          : d.action === 'publish'
            ? await publishLegal(a.id, d.id, d.reason)
            : await deleteDraft(a.id, d.id);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
