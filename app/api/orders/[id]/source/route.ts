import { originOf } from '@/lib/publicOrigin';
import { NextResponse } from 'next/server';
import { decideRelease, releaseConfigFromEnv } from '@/lib/delivery/policy';
import { deliverySecret, ensureLicense, ttlSeconds } from '@/lib/delivery/service';
import { limit } from '@/lib/rateLimit';
import { signToken } from '@/lib/delivery/token';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { CONFIG, HOUR_MS } from '@/lib/config';
import { idOf } from '@/lib/validate';
import { HELD_TEXT, heldReason } from '@/lib/holds';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/*
 * The buyer asks for the seller's real files. They are released as soon as the order is funded (money in escrow), never before payment.
 * We do not hand out the seller's link: we hand out a short-lived signed link to OUR download route, 24 hours by default, and a new one
 * can be requested any time (at most 5 an hour per order). GET redirects to the download; add ?json=1 to get the link and licence key instead.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const wantsJson = new URL(req.url).searchParams.get('json') === '1';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=' + encodeURIComponent(`/api/orders/${id}/source`), originOf(req)));

  const { data: order } = await supabase.from('orders').select('id, product_id, buyer_id, status, price_cents, created_at, funded_at').eq('id', id).single();
  if (!order || order.buyer_id !== user.id) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (await heldReason(id)) return NextResponse.json({ error: HELD_TEXT }, { status: 403 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('created_at, flagged').eq('id', user.id).single();
  const d = decideRelease(
    {
      status: order.status,
      fundedAtMs: Date.parse(order.funded_at ?? order.created_at),
      nowMs: Date.now(),
      buyerCreatedAtMs: profile?.created_at ? Date.parse(profile.created_at) : undefined,
      buyerFlagged: !!profile?.flagged,
      priceCents: order.price_cents,
    },
    releaseConfigFromEnv(),
  );
  if (!d.allowed) {
    if (d.reason === 'not_funded') return NextResponse.json({ error: 'Your files are available once your payment is held in escrow.' }, { status: 403 });
    return NextResponse.json({ error: 'Your files are almost ready.', availableAt: new Date(d.availableAtMs).toISOString() }, { status: 403 });
  }
  if (!(await limit(`source:${user.id}:${id}`, CONFIG.download.linksPerHourPerOrder, HOUR_MS)))
    return NextResponse.json({ error: 'Too many download links requested. Try again in an hour.' }, { status: 429 });

  const { data: product } = await admin.from('products').select('code_url').eq('id', order.product_id).single();
  if (!product?.code_url) return NextResponse.json({ error: 'No files on this listing.' }, { status: 404 });

  const licenseKey = await ensureLicense(id);
  const ttl = ttlSeconds();
  const token = signToken(deliverySecret(), { o: id, u: user.id, k: 'real' }, ttl);
  await admin.from('order_events').insert({ order_id: id, actor_id: user.id, event: 'download_link_issued', meta: {} });
  const url = `/api/download/${token}`;
  if (wantsJson) return NextResponse.json({ url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), licenseKey }, { headers: { 'cache-control': 'no-store' } });
  return NextResponse.redirect(new URL(url, originOf(req)));
}
