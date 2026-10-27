import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sellerOnly } from '@/lib/auth/guards';
import { proposePolicy } from '@/lib/revisions/service';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  product: z.string().min(1).max(120), // the listing's address (slug) or id
  included: z.coerce.number(),
  windowDays: z.coerce.number(),
  scope: z.string().max(1000).default(''),
  extraPrice: z.string().max(12).default(''), // dollars; empty = extra revisions are not offered at a fixed price
  supportTerms: z.string().max(1000).default(''),
});

/* The seller proposes the revision terms of one of their listings. Catalog approves them before quotations use them. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { product, extraPrice, ...terms } = body.data;
  const extraPriceCents = extraPrice.trim() === '' ? null : Math.round(Number(extraPrice) * 100);
  if (extraPriceCents !== null && !Number.isFinite(extraPriceCents)) return NextResponse.json({ error: 'Write the extra revision price in dollars, or leave it empty.' }, { status: 400 });
  const r = await proposePolicy(who.id, product, { ...terms, extraPriceCents });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
