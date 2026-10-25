import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { idOf, readJson } from '@/lib/validate';
import { decideVersion } from '@/lib/versions';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(500).default(''), filesChecked: z.boolean().default(false) });

/* Approves or rejects a new version of a digital product. Approving needs the sandbox tick; buyers with a running update period are told. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await decideVersion(a.id, id, body.data.decision, body.data.note, body.data.filesChecked);
  return r.ok ? NextResponse.json({ ok: true, notified: r.value.notified }) : NextResponse.json({ error: r.error }, { status: r.status });
}
