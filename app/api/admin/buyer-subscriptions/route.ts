import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { adminExtend, adminMove, archivePlan, cancelWithRefund, decidePayment, duplicatePlan, refundPayment, savePlan, saveSubSettings } from '@/lib/buyerSubs/service';
import { maintenanceFor } from '@/lib/maintenance/service';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('savePlan'), id: z.string().uuid().nullable(), plan: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('duplicatePlan'), id: z.string().uuid() }),
  z.object({ action: z.literal('archivePlan'), id: z.string().uuid(), archived: z.boolean() }),
  z.object({
    action: z.literal('settings'),
    enabled: z.boolean(),
    intro: z.string().max(600).default(''),
    faq: z
      .array(z.object({ q: z.string().max(200), a: z.string().max(1200) }))
      .max(20)
      .default([]),
    allowedMethods: z.array(z.string().max(64)).max(20).default([]),
  }),
  z.object({ action: z.literal('payment'), id: z.string().uuid(), verified: z.boolean() }),
  z.object({
    action: z.literal('move'),
    id: z.string().uuid(),
    to: z.enum(['active', 'suspended', 'cancelled', 'rejected']),
    reason: z.string().max(300).default(''),
    note: z.string().max(300).default(''),
  }),
  z.object({ action: z.literal('refund'), id: z.string().uuid(), reason: z.string().max(300).default(''), note: z.string().max(300).default('') }), // a verified payment refunded by hand
  z.object({ action: z.literal('cancelRefund'), id: z.string().uuid(), reason: z.string().max(300).default(''), note: z.string().max(300).default('') }),
  z.object({ action: z.literal('extend'), id: z.string().uuid(), days: z.coerce.number().optional(), note: z.string().max(10).default('') }), // the action button sends its typed text as note
]);

/*
 * Admin › Buyer subscriptions. Plans, the on/off switch and the pricing page words need a Super Admin; payments and subscription changes need
 * Finance (or Super). Every change is audited.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const b = body.data;
  const a = await adminOnly(['savePlan', 'duplicatePlan', 'archivePlan', 'settings'].includes(b.action) ? 'super' : ['finance', 'super']);
  if (!a.ok) return a.res;
  const r =
    b.action === 'savePlan'
      ? await savePlan(a.id, b.id, b.plan)
      : b.action === 'duplicatePlan'
        ? await duplicatePlan(a.id, b.id)
        : b.action === 'archivePlan'
          ? await archivePlan(a.id, b.id, b.archived)
          : b.action === 'settings'
            ? await saveSubSettings(a.id, b)
            : b.action === 'payment'
              ? await decidePayment(a.id, b.id, b.verified)
              : b.action === 'move'
                ? await adminMove(a.id, b.id, b.to, b.reason || b.note)
                : b.action === 'refund'
                  ? await refundPayment(a.id, b.id, b.reason || b.note)
                  : b.action === 'cancelRefund'
                    ? await cancelWithRefund(a.id, b.id, b.reason || b.note)
                    : await adminExtend(a.id, b.id, b.days ?? Number(b.note));
  return r.ok ? NextResponse.json({ ok: true, value: r.value }) : NextResponse.json({ error: r.error }, { status: r.status });
}
