import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { audit } from '@/lib/admin/audit';
import { maintenanceFor } from '@/lib/maintenance/service';
import { getOrder } from '@/lib/orders/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({
  orderId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/, 'Write the domain, for example example.com.'),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Write the expiry date as YYYY-MM-DD.'),
  registrarRef: z.string().trim().max(120).optional(),
});

/*
 * Domains are registered by hand while no registrar is connected (owner, 2026-11-07). After registering it at the registrar IN THE BUYER'S NAME, an
 * admin records it here: the domain then shows in the buyer's dashboard. Support or Super Admin; audited. The buyer is always the order's buyer.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('domains');
  if (closed) return closed;
  const a = await adminOnly('support');
  if (!a.ok) return a.res;
  if (!supabaseConfigured) return NextResponse.json({ error: 'Domains need the database.' }, { status: 404 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { orderId, name, expiresAt, registrarRef } = body.data;
  const o = await getOrder(orderId);
  if (!o || !o.buyerId) return NextResponse.json({ error: 'Order not found, or it has no buyer account.' }, { status: 404 });
  if (Date.parse(expiresAt) < Date.now()) return NextResponse.json({ error: 'The expiry date has passed.' }, { status: 400 });
  const { error } = await createAdminClient()
    .from('domains')
    .insert({ order_id: orderId, owner_id: o.buyerId, name, source: 'purchased', registrar_ref: registrarRef || null, expires_at: expiresAt });
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That domain is already recorded.' : 'Could not save.' }, { status: error.code === '23505' ? 409 : 500 });
  await audit(a.id, 'domain_recorded', 'order', orderId, { name, expiresAt });
  return NextResponse.json({ ok: true });
}
