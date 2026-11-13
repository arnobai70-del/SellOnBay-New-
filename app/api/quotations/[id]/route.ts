import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerOnly } from '@/lib/auth/guards';
import { limit } from '@/lib/rateLimit';
import { acceptQuote, rejectQuote } from '@/lib/requests/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['accept', 'reject']), note: z.string().max(2000).default('') });

/* The buyer accepts the exact quotation version (an order is created in the same database transaction) or declines it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await buyerOnly();
  if (!who.ok) return who.res;
  if (!(await limit(`quote-act:${who.id}`, 30, 3_600_000))) return jsonT({ error: tx('Too many tries. Wait a while.') }, { status: 429 });
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  if (body.data.action === 'accept') {
    const r = await acceptQuote(who.id, id);
    return r.ok ? NextResponse.json({ ok: true, order: r.value.orderId }) : jsonT({ error: r.error }, { status: r.status });
  }
  const r = await rejectQuote(who.id, id, body.data.note);
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}
