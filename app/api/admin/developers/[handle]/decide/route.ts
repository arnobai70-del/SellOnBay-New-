import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { decideDev } from '@/lib/admin/queue';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ decision: z.enum(['approve', 'changes', 'reject']), note: z.string().max(700).default('') });

/* Approve or reject a developer profile in review. */
export async function POST(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const handle = await idOf(params.then((p) => ({ id: p.handle })));
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await decideDev(a.id, handle, body.data.decision, body.data.note);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
