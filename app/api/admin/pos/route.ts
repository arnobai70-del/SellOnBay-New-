import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { cashSale } from '@/lib/pos/service';
import { limit } from '@/lib/rateLimit';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const dollars = z.union([z.number(), z.string()]).transform((v) => Math.round(Number(v) * 100));
const schema = z.object({ buyerEmail: z.string().email().max(200), productKey: z.string().min(1).max(200), receipt: z.string().max(40), amount: dollars });

/* The cash desk (owner, 2026-11-08): Finance or Super Admin records cash taken at a point of sale. Closed in the free beta (lib/pos/service.ts). */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  if (!(await limit(`pos:${a.id}`, 30, 3_600_000))) return jsonT({ error: tx('Too many cash sales this hour.') }, { status: 429 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const b = body.data;
  if (!Number.isFinite(b.amount) || b.amount <= 0) return jsonT({ error: tx('Write the amount of cash taken.') }, { status: 400 });
  const r = await cashSale(a.id, { buyerEmail: b.buyerEmail, productKey: b.productKey, receipt: b.receipt, amountCents: b.amount });
  return r.ok ? NextResponse.json({ ok: true, orderId: r.value.orderId }) : jsonT({ error: r.error }, { status: r.status });
}
