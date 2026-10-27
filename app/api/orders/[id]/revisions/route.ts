import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerOnly } from '@/lib/auth/guards';
import { requestRevision } from '@/lib/revisions/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ description: z.string().max(4000), hint: z.enum(['defect', 'change']), consent: z.boolean() });

/* The buyer asks for a revision on their delivered order (lib/revisions). SellOnBay decides whether it is a defect, included or paid. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await buyerOnly();
  if (!who.ok) return who.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await requestRevision(who.id, await idOf(params), body.data);
  return r.ok ? NextResponse.json({ ok: true, id: r.value.id }) : NextResponse.json({ error: r.error, blocked: r.blocked ?? false }, { status: r.status });
}
