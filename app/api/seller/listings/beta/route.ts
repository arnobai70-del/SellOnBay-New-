import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/admin/audit';
import { forgetLiveProducts } from '@/lib/catalog';
import { maintenanceFor } from '@/lib/maintenance/service';
import { sellerOnly } from '@/lib/seller/guard';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({ slug: z.string().min(1).max(200), on: z.boolean() });

/* "Offer this website free during beta" (owner, 2026-11-07): the seller's own switch on their own listing. Audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller');
  if (closed) return closed;
  if (!supabaseConfigured) return NextResponse.json({ error: 'This needs an account. There are none in demo mode.' }, { status: 404 });
  const s = await sellerOnly();
  if (!s.ok) return s.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { data, error } = await createAdminClient().from('products').update({ beta_free_ok: body.data.on }).eq('slug', body.data.slug).eq('seller_id', s.id).select('slug');
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  forgetLiveProducts();
  await audit(s.id, 'listing_beta_offer', 'product', body.data.slug, { on: body.data.on });
  return NextResponse.json({ ok: true });
}
