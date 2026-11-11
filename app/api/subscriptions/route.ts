import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mayBuy, BUYERS_ONLY } from '@/lib/accounts';
import { pickWebsite, submitPayment, subscribe } from '@/lib/buyerSubs/service';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('subscribe'), planId: z.string().uuid(), coupon: z.string().max(40).default('') }),
  z.object({
    action: z.literal('pay'),
    subscriptionId: z.string().uuid(),
    kind: z.enum(['new', 'renewal']),
    method: z.string().max(80).default(''),
    reference: z.string().max(80),
    paidOn: z.string().max(10).nullable().default(null),
  }),
  z.object({ action: z.literal('pick'), subscriptionId: z.string().uuid(), productKey: z.string().min(1).max(200) }),
]);

/* Buyer subscriptions (lib/buyerSubs): start one, report a manual payment, choose a website. Signed-in buyers (and sellers who buy) only. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('checkout');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  let buyerId = 'demo-buyer';
  if (supabaseConfigured) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const { data: p } = await sb.from('profiles').select('role, banned, suspended_until').eq('id', user.id).single();
    if (!p || p.banned || (p.suspended_until && Date.parse(p.suspended_until) > Date.now())) return NextResponse.json({ error: 'This account cannot do this.' }, { status: 403 });
    if (!mayBuy(p.role)) return NextResponse.json({ error: BUYERS_ONLY }, { status: 403 });
    buyerId = user.id;
  }
  if (!(await limit(`subs:${buyerId}`, 30, 3_600_000))) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  const b = body.data;
  const r =
    b.action === 'subscribe'
      ? await subscribe(buyerId, b.planId, b.coupon || null)
      : b.action === 'pay'
        ? await submitPayment(buyerId, b.subscriptionId, { kind: b.kind, methodLabel: b.method, reference: b.reference, paidOn: b.paidOn })
        : await pickWebsite(buyerId, b.subscriptionId, b.productKey);
  return r.ok ? NextResponse.json({ ok: true, value: r.value }) : NextResponse.json({ error: r.error }, { status: r.status });
}
