import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerOnly } from '@/lib/auth/guards';
import { buyerRequestAction } from '@/lib/requests/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['answer', 'withdraw', 'confirm_requirements']), note: z.string().max(4000).default('') });

/* The buyer answers SellOnBay's question, withdraws the request, or confirms the written requirements of a custom job. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await buyerOnly();
  if (!who.ok) return who.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await buyerRequestAction(who.id, id, body.data.action, body.data.note);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
