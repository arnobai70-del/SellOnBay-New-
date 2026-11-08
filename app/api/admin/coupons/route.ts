import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { checkCoupon, COUPON_LIMIT } from '@/lib/marketing/coupons';
import { saveCoupons, savedCoupons } from '@/lib/site/contentStore';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({
  action: z.enum(['add', 'toggle', 'remove']),
  code: z.string().max(30),
  percentOff: z.union([z.number(), z.string()]).optional(),
  endsOn: z.string().max(10).optional(),
  maxUses: z.union([z.number(), z.string()]).optional(),
});

/* Coupons (Admin › Marketing; marketing is the Content scope). The platform pays the discount (lib/marketing/coupons.ts). Every change is audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const b = body.data;
  const code = b.code.trim().toUpperCase();
  const list = await savedCoupons(0);
  let next = list;
  if (b.action === 'add') {
    const c = checkCoupon({ code, percentOff: b.percentOff, endsOn: b.endsOn || null, maxUses: b.maxUses ?? null, active: true });
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
    if (list.some((x) => x.code === code)) return NextResponse.json({ error: 'That code already exists.' }, { status: 409 });
    if (list.length >= COUPON_LIMIT) return NextResponse.json({ error: `At most ${COUPON_LIMIT} coupons.` }, { status: 400 });
    next = [...list, c.value];
  } else {
    if (!list.some((x) => x.code === code)) return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    next = b.action === 'remove' ? list.filter((x) => x.code !== code) : list.map((x) => (x.code === code ? { ...x, active: !x.active } : x));
  }
  const r = await saveCoupons(a.id, next);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
