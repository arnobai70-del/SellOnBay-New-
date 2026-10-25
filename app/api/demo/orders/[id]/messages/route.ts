import { NextResponse } from 'next/server';
import { z } from 'zod';
import { orderFor } from '@/lib/commerce/access';
import { clientIp } from '@/lib/delivery/service';
import { listMessages, roleIn, sendMessage } from '@/lib/chat';
import { getViewerId, viewerBlocked } from '@/lib/supabase/viewer';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ body: z.string().max(4000) });

/* The buyer reads and writes the order chat (also works without an account in demo mode). The seller uses /api/orders/[id]/messages. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o || !roleIn(o, (await getViewerId()) ?? null)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || 0;
  return NextResponse.json({ messages: await listMessages(o.id, since), now: Date.now() }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  const viewer = (await getViewerId()) ?? null;
  const role = o ? roleIn(o, viewer) : null;
  if (!o || !role) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  // A banned account, or one suspended for chat strikes, cannot write until the suspension ends (reading stays open).
  if (await viewerBlocked(viewer)) return NextResponse.json({ error: 'This account cannot send messages right now.' }, { status: 403 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await sendMessage(o, role, viewer, clientIp(req), body.data.body);
  return r.ok ? NextResponse.json({ ok: true, message: r.message }) : NextResponse.json({ error: r.error, blocked: r.blocked ?? false }, { status: r.status });
}
