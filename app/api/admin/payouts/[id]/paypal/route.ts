import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { checkPaypalPayout, sendPaypalPayout } from '@/lib/payouts';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['send', 'check']) });

/* Send a seller's payout through PayPal, or ask PayPal whether it arrived. An admin clicks each one; nothing is sent by itself. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  if (body.data.action === 'send') {
    const r = await sendPaypalPayout(id, a.id);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  const r = await checkPaypalPayout(id, a.id);
  return r.ok ? NextResponse.json({ ok: true, state: r.state }) : NextResponse.json({ error: r.error }, { status: r.status });
}
