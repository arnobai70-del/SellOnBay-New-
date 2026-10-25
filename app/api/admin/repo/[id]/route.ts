import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { confirmRevoked, remindSeller } from '@/lib/repoAccess';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['confirm', 'remind']), note: z.string().max(500).default('') });

/* The admin checklist for repository access after a refund: confirm it was removed (a note on how it was checked), or remind the seller. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = body.data.action === 'confirm' ? await confirmRevoked(a.id, id, body.data.note) : await remindSeller(a.id, id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
