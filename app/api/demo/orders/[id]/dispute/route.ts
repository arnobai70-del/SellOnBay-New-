import { NextResponse } from 'next/server';
import { z } from 'zod';
import { orderFor } from '@/lib/commerce/access';
import { openDispute } from '@/lib/disputes';
import { getViewerId } from '@/lib/supabase/viewer';
import { idOf, readJson } from '@/lib/validate';
import { guard } from '@/lib/guard';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ reason: z.string().max(40), detail: z.string().max(2500) });

/* The buyer reports a problem during the review window or the 7-day bug-fix window. Payment for the order is held until it is decided. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('disputes'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const viewer = (await getViewerId()) ?? null;
  const g = await guard('dispute', viewer);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const r = await openDispute(o.id, viewer, body.data);
  return r.ok ? NextResponse.json({ ok: true, id: r.value.id }) : NextResponse.json({ error: r.error }, { status: r.status });
}
