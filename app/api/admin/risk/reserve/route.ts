import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { removeSellerReserve, setSellerReserve } from '@/lib/reserve';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  sellerId: z.string().trim().min(1).max(64),
  percent: z.coerce.number().int().optional(),
  days: z.coerce.number().int().optional(),
  remove: z.boolean().optional(),
  note: z.string().max(500).default(''),
  reason: z.string().max(500).default(''),
});

/* Sets or removes one seller's reserve rule (a share of earnings kept back for some days). A reason is required and goes in the audit log. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { sellerId, percent, days, remove, note, reason } = body.data;
  const why = note || reason;
  const r = remove ? await removeSellerReserve(a.id, sellerId, why) : await setSellerReserve(a.id, sellerId, percent ?? Number.NaN, days ?? Number.NaN, why);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
