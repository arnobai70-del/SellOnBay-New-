import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { adminRequestAction, draftQuote } from '@/lib/requests/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const line = z.object({ label: z.string().max(120), cents: z.coerce.number(), kind: z.string().max(20), passThroughVerified: z.boolean().optional() });
const schema = z.union([
  z.object({
    action: z.enum(['review', 'ask', 'decline', 'set_expiry', 'propose_requirements']),
    note: z.string().max(2000).optional(),
    expiresInDays: z.coerce.number().optional(),
    requirements: z.string().max(8000).optional(),
  }),
  z.object({ action: z.literal('draft_quote'), lines: z.array(line).max(20), terms: z.record(z.string(), z.unknown()), overrideReason: z.string().max(1000).optional() }),
]);

/* Support or Catalog moves a purchase request on, or drafts a quotation for it. Prices come only from here, never from the buyer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly(['support', 'catalog']);
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  try {
    const r =
      d.action === 'draft_quote'
        ? await draftQuote(a.id, id, { lines: d.lines, terms: d.terms, overrideReason: d.overrideReason })
        : await adminRequestAction(a.id, id, d.action, { note: d.note, expiresInDays: d.expiresInDays, requirements: d.requirements });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
