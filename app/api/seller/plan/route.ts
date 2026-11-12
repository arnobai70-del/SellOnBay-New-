import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sellerOnly } from '@/lib/auth/guards';
import { notifyAdmins } from '@/lib/notify';
import { limit } from '@/lib/rateLimit';
import { requestPlan } from '@/lib/plans/service';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ plan: z.string().max(20), billing: z.string().max(10) });

/* A seller asks for Pro or Business. Nothing is charged; SellOnBay sends payment instructions and an admin activates it after reconciliation. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  if (!(await limit(`plan-request:${who.id}`, 5, 24 * 3_600_000))) return jsonT({ error: tx('Too many plan requests today. Try again tomorrow.') }, { status: 429 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await requestPlan(who.id, body.data.plan, body.data.billing);
  if (!r.ok) return jsonT({ error: r.error }, { status: r.status });
  await notifyAdmins('plan_requested', { plan: body.data.plan, billing: body.data.billing });
  return NextResponse.json({ ok: true });
}
