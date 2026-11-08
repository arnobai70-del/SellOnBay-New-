import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mayBuy, BUYERS_ONLY } from '@/lib/accounts';
import { BETA_CART_LIMIT } from '@/lib/beta/rules';
import { requestBeta } from '@/lib/beta/service';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({
  ids: z.array(z.string().min(1).max(200)).min(1).max(BETA_CART_LIMIT),
  name: z.string().max(100),
  email: z.string().max(254),
  country: z.string().max(2),
  company: z.string().max(120).default(''),
  useFor: z.string().max(1000),
  domain: z.string().max(253).default(''),
});

/* One free beta request per website in the cart. Only a signed-in buyer; the server decides what can be requested. Nothing is charged. */
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
    if (!p || p.banned || (p.suspended_until && Date.parse(p.suspended_until) > Date.now())) return NextResponse.json({ error: 'This account cannot make requests.' }, { status: 403 });
    if (!mayBuy(p.role)) return NextResponse.json({ error: BUYERS_ONLY }, { status: 403 });
    buyerId = user.id;
  }
  if (!(await limit(`beta:${buyerId}`, 10, 3_600_000))) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  const { ids, ...form } = body.data;
  const orders: string[] = [];
  const problems: string[] = [];
  for (const id of ids) {
    const r = await requestBeta(buyerId, id, form);
    if (r.ok) orders.push(r.value.id);
    else problems.push(r.error);
  }
  if (!orders.length) return NextResponse.json({ error: problems[0] ?? 'Could not make the request.' }, { status: 409 });
  return NextResponse.json({ orders, problems });
}
