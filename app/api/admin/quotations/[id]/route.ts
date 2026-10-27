import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { hasScope } from '@/lib/admin/scopes';
import { issueQuote, superDecision, withdrawQuote } from '@/lib/requests/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['issue', 'withdraw', 'approve_override', 'decline_override']), reason: z.string().max(2000).default('') });

/* Issue or withdraw a quotation (Support, Catalog); approve or send back a price that differs from the listed price (Super Admin only, O-8). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly(['support', 'catalog']);
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  if ((d.action === 'approve_override' || d.action === 'decline_override') && !hasScope(a.scopes, 'super'))
    return NextResponse.json({ error: 'Only a Super Admin can approve a price that differs from the listed price.' }, { status: 403 });
  try {
    const r =
      d.action === 'issue'
        ? await issueQuote(a.id, id)
        : d.action === 'withdraw'
          ? await withdrawQuote(a.id, id, d.reason)
          : await superDecision(a.id, id, d.action === 'approve_override' ? 'approve' : 'decline', d.reason);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
