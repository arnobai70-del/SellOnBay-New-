import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { saveSellerSubSettings, savePlanVersion, setPlanOffered } from '@/lib/plans/admin';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const display = z.object({
  description: z.string().max(400).default(''),
  badge: z.string().max(30).default(''),
  benefits: z
    .array(z.object({ text: z.string().max(120), on: z.boolean() }))
    .max(20)
    .default([]),
  sort: z.coerce.number().int().default(0),
  visible: z.boolean().default(true),
});
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('settings'), enabled: z.boolean(), display: z.record(z.string(), display).default({}) }),
  z.object({
    action: z.literal('saveVersion'),
    code: z.enum(['free', 'pro', 'business']),
    name: z.string().max(40),
    monthlyCents: z.coerce.number().int(),
    yearlyCents: z.coerce.number().int(),
    commissionBps: z.coerce.number().int(),
    listingLimit: z.coerce.number().int(),
    featured: z.boolean().default(false),
  }),
  z.object({ action: z.literal('offer'), code: z.enum(['free', 'pro', 'business']), offered: z.boolean() }),
]);

/*
 * Admin › Subscription Management › Seller (owner, 2026-11-12), on the existing seller plan system (lib/plans). Super Admin only; every change is
 * audited. Seller subscriptions themselves are still moved at POST /api/admin/subscriptions/[id] (Finance), as before.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const b = body.data;
  const r = b.action === 'settings' ? await saveSellerSubSettings(a.id, b) : b.action === 'saveVersion' ? await savePlanVersion(a.id, b) : await setPlanOffered(a.id, b.code, b.offered);
  return r.ok ? NextResponse.json({ ok: true, value: r.value }) : NextResponse.json({ error: r.error }, { status: r.status });
}
