import { NextResponse } from 'next/server';
import { z } from 'zod';
import { orderFor } from '@/lib/commerce/access';
import { addReview } from '@/lib/reviews';
import { getViewerId, viewerBlocked } from '@/lib/supabase/viewer';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ rating: z.number().int(), body: z.string().max(1200).default('') });

/* The buyer of an accepted order leaves a review (one per order). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const viewer = (await getViewerId()) ?? null;
  if (await viewerBlocked(viewer)) return NextResponse.json({ error: 'This account cannot leave reviews.' }, { status: 403 });
  const r = await addReview(o.id, viewer, body.data);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
