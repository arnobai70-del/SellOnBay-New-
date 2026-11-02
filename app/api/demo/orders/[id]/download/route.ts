import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { deliverySecret, ensureLicense, ttlSeconds } from '@/lib/delivery/service';
import { CONFIG } from '@/lib/config';
import { limit } from '@/lib/rateLimit';
import { signToken } from '@/lib/delivery/token';
import { decideRelease, releaseConfigFromEnv } from '@/lib/delivery/policy';
import { HELD_TEXT, heldReason } from '@/lib/holds';
import { isFundedState } from '@/lib/orders/machine';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { gateFor } from '@/lib/release/gate';
import { GATE_TEXT } from '@/lib/release/rules';

export const runtime = 'nodejs';

/* Demo orders follow the same rule as real ones: nothing before the order is funded, then a signed 24-hour link and a licence key. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const o = await orderFor(id);
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!isFundedState(o.state)) return NextResponse.json({ error: 'Your files are available once your payment is held in escrow.' }, { status: 403 });
  // The release gate (SellOnBay 2.0, D-A): nothing, not even the licence key, before an admin's release approval (or a legacy review).
  const g = await gateFor({ id: o.id, status: o.state, quotationId: o.quotationId, releaseApprovedAt: o.releaseApprovedAt });
  if (!g.allowed) return NextResponse.json({ error: GATE_TEXT[g.reason] }, { status: 403 });
  // A seller's real files: the same checks as /api/orders/[id]/source before the licence key or a link goes out (safety hold, release delay).
  const real = !!o.productId && !!o.buyerId;
  if (real) {
    if (await heldReason(id)) return NextResponse.json({ error: HELD_TEXT }, { status: 403 });
    let profile: { created_at: string | null; flagged: boolean | null } | null = null;
    if (supabaseConfigured) {
      const p = await createAdminClient().from('profiles').select('created_at, flagged').eq('id', o.buyerId!).maybeSingle();
      // Fail closed: without the buyer's facts the release delay for new or flagged buyers cannot be applied.
      if (p.error) return NextResponse.json({ error: 'Your files could not be prepared just now. Try again in a minute.' }, { status: 503 });
      profile = p.data;
    }
    const d = decideRelease(
      {
        status: o.state,
        fundedAtMs: o.fundedAt ?? o.createdAt,
        nowMs: Date.now(),
        buyerCreatedAtMs: profile?.created_at ? Date.parse(profile.created_at) : undefined,
        buyerFlagged: !!profile?.flagged,
        priceCents: o.priceCents,
      },
      releaseConfigFromEnv(),
    );
    if (!d.allowed) return NextResponse.json({ error: 'Your files are almost ready.', availableAt: d.reason === 'delay' ? new Date(d.availableAtMs).toISOString() : undefined }, { status: 403 });
  }
  if (!(await limit(`source:${o.buyerId ?? 'anon'}:${id}`, CONFIG.download.linksPerHourPerOrder, 60 * 60 * 1000)))
    return NextResponse.json({ error: 'Too many download links requested. Try again in an hour.' }, { status: 429 });
  const licenseKey = await ensureLicense(id);
  const ttl = ttlSeconds();
  // A seller's real files come through the real route (signed in as the buyer); only a made-up starter gets the harmless dummy file.
  const token = signToken(deliverySecret(), { o: id, u: o.buyerId ?? null, k: real ? 'real' : 'demo' }, ttl);
  return NextResponse.json({ url: `/api/download/${token}`, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), licenseKey }, { headers: { 'cache-control': 'no-store' } });
}
