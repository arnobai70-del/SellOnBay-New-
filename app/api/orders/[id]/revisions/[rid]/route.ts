import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerOnly } from '@/lib/auth/guards';
import { CONFIG, HOUR_MS } from '@/lib/config';
import { deliverySecret, ttlSeconds } from '@/lib/delivery/service';
import { signToken } from '@/lib/delivery/token';
import { getOrder } from '@/lib/orders/service';
import { limit } from '@/lib/rateLimit';
import { approvedRevisionFileFor, gateFor } from '@/lib/release/gate';
import { GATE_TEXT } from '@/lib/release/rules';
import { buyerRevisionAnswer } from '@/lib/revisions/service';
import { idParam, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answer'), answer: z.enum(['done', 'not_done']), note: z.string().max(2000).default('') }),
  z.object({ action: z.literal('link') }),
]);

/*
 * The buyer answers a delivered revision (done, or not done: a follow-up goes back to the seller), or asks for a download link to its
 * released file. The link goes through the order's release gate and is checked again on every download (/api/download/<token>).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await buyerOnly();
  if (!who.ok) return who.res;
  const p = await params;
  const id = idParam.safeParse(p.id);
  const rid = idParam.safeParse(p.rid);
  if (!id.success || !rid.success) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  if (body.data.action === 'answer') {
    const r = await buyerRevisionAnswer(who.id, rid.data, body.data.answer, body.data.note);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  const o = await getOrder(id.data);
  if (!o || o.buyerId !== who.id) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const g = await gateFor({ id: o.id, status: o.state, quotationId: o.quotationId, releaseApprovedAt: o.releaseApprovedAt });
  if (!g.allowed) return NextResponse.json({ error: GATE_TEXT[g.reason] }, { status: 403 });
  if (!(await approvedRevisionFileFor(o.id, rid.data))) return NextResponse.json({ error: 'No released file for this revision.' }, { status: 404 });
  if (!(await limit(`revlink:${who.id}:${o.id}`, CONFIG.download.linksPerHourPerOrder, HOUR_MS)))
    return NextResponse.json({ error: 'Too many download links requested. Try again in an hour.' }, { status: 429 });
  const ttl = ttlSeconds();
  const token = signToken(deliverySecret(), { o: o.id, u: who.id, k: 'real', r: rid.data }, ttl);
  return NextResponse.json({ url: `/api/download/${token}`, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() }, { headers: { 'cache-control': 'no-store' } });
}
