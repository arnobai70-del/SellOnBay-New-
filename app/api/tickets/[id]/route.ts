import { NextResponse } from 'next/server';
import { z } from 'zod';
import { participant } from '@/lib/auth/guards';
import { closeTicket } from '@/lib/messaging/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ status: z.enum(['open', 'waiting_user', 'closed']) });

/* The opener closes their ticket; an admin may set any status. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await participant();
  if (!who.ok) return who.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await closeTicket(who.viewer, id, body.data.status);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
