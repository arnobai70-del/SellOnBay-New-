import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { saleForm } from '@/lib/prices/form';
import { cancelSale, createSale } from '@/lib/prices/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.intersection(z.object({ slug: z.string().min(1).max(200) }), saleForm);

/* An admin (Catalog) plans or stops a launch price or sale on any listing, under the same rules as sellers. Audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('catalog');
  if (!a.ok) return a.res;
  if (!supabaseConfigured) return jsonT({ error: tx('Sales need the database.') }, { status: 404 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const { data: p } = await createAdminClient().from('products').select('id').eq('slug', d.slug).maybeSingle();
  if (!p) return jsonT({ error: tx('Listing not found.') }, { status: 404 });
  const r = d.action === 'cancel' ? await cancelSale(a.id, d.saleId) : await createSale(a.id, p.id, { kind: d.kind, saleCents: d.salePrice, startsAt: d.startsAt, endsAt: d.endsAt });
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}
