import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { decidePolicy } from '@/lib/revisions/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().max(500).default('') });

/* Catalog approves or rejects the revision terms a seller proposed for a listing. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('catalog');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  try {
    const r = await decidePolicy(a.id, await idOf(params), body.data.decision, body.data.reason);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
