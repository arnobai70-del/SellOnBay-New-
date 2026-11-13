import { NextResponse } from 'next/server';
import { z } from 'zod';
import { maintenanceFor } from '@/lib/maintenance/service';
import { saleForm } from '@/lib/prices/form';
import { cancelSale, createSale } from '@/lib/prices/service';
import { sellerOnly } from '@/lib/seller/guard';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.intersection(z.object({ slug: z.string().min(1).max(200) }), saleForm);

/* A seller plans a launch price or a sale on their own listing, or stops one (owner, 2026-11-08). Rules in lib/prices/rules.ts; audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller');
  if (closed) return closed;
  if (!supabaseConfigured) return jsonT({ error: tx('Sales need the database.') }, { status: 404 });
  const s = await sellerOnly();
  if (!s.ok) return s.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const { data: p } = await createAdminClient().from('products').select('id').eq('slug', d.slug).eq('seller_id', s.id).maybeSingle();
  if (!p) return jsonT({ error: tx('Listing not found.') }, { status: 404 });
  const r =
    d.action === 'cancel'
      ? await cancelSale(s.id, d.saleId, { sellerId: s.id })
      : await createSale(s.id, p.id, { kind: d.kind, saleCents: d.salePrice, startsAt: d.startsAt, endsAt: d.endsAt }, { sellerId: s.id });
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}
