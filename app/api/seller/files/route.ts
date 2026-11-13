import { NextResponse } from 'next/server';
import { revisionsFor } from '@/lib/revisions/store';
import { z } from 'zod';
import { sellerOnly } from '@/lib/auth/guards';
import { limit } from '@/lib/rateLimit';
import { startUpload } from '@/lib/files/service';
import { getOrder } from '@/lib/orders/service';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({
  product: z.string().min(1).max(80).optional(),
  order: z.uuid().optional(),
  purpose: z.enum(['listing', 'version', 'delivery', 'revision']).default('listing'),
  name: z.string().min(1).max(200),
  size: z.coerce.number().int().positive(),
});

/*
 * A seller asks for a one-time upload link for a source archive: of their own listing (listing files or a new version), or the delivery of a
 * work order they were authorised to do. The file goes straight into private quarantine; nothing is approved until it passed the automatic
 * checks and a human review, and nothing reaches a buyer before a release approval.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('upload'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  if (!(await limit(`file-upload:${who.id}`, 20, 3_600_000))) return jsonT({ error: tx('Too many uploads this hour. Try again later.') }, { status: 429 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  if (d.purpose === 'delivery') {
    const o = d.order ? await getOrder(d.order) : null;
    if (!o || o.sellerId !== who.id || !o.quotationId) return jsonT({ error: tx('Order not found.') }, { status: 404 });
    if (!['in_delivery', 'overdue', 'fix_requested'].includes(o.state)) return jsonT({ error: tx('This order is not waiting for your delivery.') }, { status: 409 });
    const r = await startUpload(who.id, { productId: o.productId, orderId: o.id, purpose: 'delivery', name: d.name, size: d.size });
    if (!r.ok) return jsonT({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, id: r.value.file.id, path: r.value.file.quarantinePath, token: r.value.token, uploadUrl: r.value.uploadUrl });
  }
  if (d.purpose === 'revision') {
    // Revised files for a revision SellOnBay assigned to this seller (lib/revisions); checked and reviewed like every file.
    const o = d.order ? await getOrder(d.order) : null;
    const open = o ? (await revisionsFor({ orderId: o.id, sellerId: who.id, statuses: ['assigned'] })).length : 0;
    if (!o || o.sellerId !== who.id || !open) return jsonT({ error: tx('There is no revision waiting for your work on this order.') }, { status: 404 });
    const r = await startUpload(who.id, { productId: o.productId, orderId: o.id, purpose: 'revision', name: d.name, size: d.size });
    if (!r.ok) return jsonT({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, id: r.value.file.id, path: r.value.file.quarantinePath, token: r.value.token, uploadUrl: r.value.uploadUrl });
  }
  const { data: p } = d.product ? await createAdminClient().from('products').select('id, seller_id').eq('slug', d.product).maybeSingle() : { data: null };
  if (!p || p.seller_id !== who.id) return jsonT({ error: tx('Listing not found.') }, { status: 404 });
  const r = await startUpload(who.id, { productId: p.id, purpose: d.purpose, name: d.name, size: d.size });
  if (!r.ok) return jsonT({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.value.file.id, path: r.value.file.quarantinePath, token: r.value.token, uploadUrl: r.value.uploadUrl });
}
