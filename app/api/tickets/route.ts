import { NextResponse } from 'next/server';
import { z } from 'zod';
import { participant } from '@/lib/auth/guards';
import { openTicket } from '@/lib/messaging/service';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  subject: z.string().max(120),
  body: z.string().max(4000),
  orderId: z
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

/* A buyer or seller opens a support ticket with SellOnBay. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await participant();
  if (!who.ok) return who.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await openTicket(who.viewer, body.data);
  return r.ok ? NextResponse.json({ ok: true, id: r.value.id }) : NextResponse.json({ error: r.error }, { status: r.status });
}
