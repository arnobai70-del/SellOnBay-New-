import { NextResponse } from 'next/server';
import { z } from 'zod';
import { participant } from '@/lib/auth/guards';
import { postMessage, readConversation } from '@/lib/messaging/service';
import { idParam, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const TYPES = ['request', 'order', 'ticket'] as const;
const schema = z.object({ channel: z.enum(['buyer_admin', 'admin_seller', 'internal']), body: z.string().max(4000) });
const parse = async (params: Promise<{ type: string; id: string }>) => {
  const p = await params;
  const id = idParam.safeParse(p.id);
  return (TYPES as readonly string[]).includes(p.type) && id.success ? { type: p.type as (typeof TYPES)[number], id: id.data } : null;
};

/* Reads the channels the viewer may see about a request, an order or a ticket (admin-mediated, D-B). Anyone else gets "not found". */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await participant();
  if (!who.ok) return who.res;
  const s = await parse(params);
  if (!s) return jsonT({ error: tx('Not found.') }, { status: 404 });
  const r = await readConversation(who.viewer, s.type, s.id);
  return r.ok ? NextResponse.json(r.value, { headers: { 'cache-control': 'no-store' } }) : jsonT({ error: r.error }, { status: r.status });
}

/* Writes in one channel the viewer belongs to. Buyers and sellers are checked for contact details and outside-payment talk on the server. */
export async function POST(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await participant();
  if (!who.ok) return who.res;
  const s = await parse(params);
  if (!s) return jsonT({ error: tx('Not found.') }, { status: 404 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await postMessage(who.viewer, s.type, s.id, body.data.channel, body.data.body);
  return r.ok ? NextResponse.json({ ok: true, message: r.value }) : jsonT({ error: r.error, blocked: r.blocked ?? false }, { status: r.status });
}
