import { NextResponse } from 'next/server';
import { isBlocked } from '@/lib/chatFilter';
import { quoteSite } from '@/lib/commerce/quote';
import { getDev } from '@/lib/devsDb';
import { creditsTrial, trialOf } from '@/lib/developers';
import { findTrialCredit } from '@/lib/orders/trial';
import { deliveryTypeOf, licenceOf } from '@/lib/handover';
import { infoOf } from '@/lib/productInfo';
import { createOrder } from '@/lib/orders/service';
import { orderCreateSchema } from '@/lib/schemas';
import { accountLockedOut, getViewerId, viewerBlocked, viewerMayBuy } from '@/lib/supabase/viewer';
import { supabaseConfigured } from '@/lib/supabase/env';
import { BUYERS_ONLY } from '@/lib/accounts';
import { examplesBuyable } from '@/lib/examples';
import { readJson } from '@/lib/validate';
import { isPkg } from '@/lib/data';
import { guard } from '@/lib/guard';
import { PAUSED_TEXT, checkoutPausedFor } from '@/lib/switches';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/* Creates an order waiting for payment. What was chosen comes from the browser; what it costs is worked out here. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const parsed = await readJson(req, orderCreateSchema);
  if (!parsed.ok) return parsed.res;
  const b = parsed.data;
  const buyerId = (await getViewerId()) ?? null;
  // Visitors browse but do not buy; only demo mode (no accounts at all) keeps the signed-out flow for the made-up examples.
  if (supabaseConfigured && !buyerId) return fail('Sign in with a buyer account to buy.', 401);
  if (await viewerBlocked(buyerId)) return fail('This account cannot place orders.', 403);
  if (!(await viewerMayBuy(buyerId))) return fail(BUYERS_ONLY, 403);
  const g = await guard('order', buyerId);
  if (!g.ok) return fail(g.error, g.status);
  if (await checkoutPausedFor(buyerId)) return fail(PAUSED_TEXT, 503);

  if (b.kind === 'hire') {
    const brief = String(b.brief ?? '').trim();
    if (brief.length < 20 || brief.length > 2000) return fail('Write 20 to 2000 characters about what you need.');
    if (isBlocked(brief)) return fail('Keep emails, phone numbers and outside payment talk out of the brief.');
    const r = await getDev(String(b.dev ?? ''), buyerId ?? undefined);
    if (!r || r.status !== 'live') return fail('That developer is not available.', 404);
    if (r.dev.avail === 'Booked') return fail('This developer is fully booked right now. Try again later or pick another developer.', 409);
    // A real developer's profile is a real order: the developer delivers it and is paid through the ledger, so both sides need an account.
    // The made-up starter profiles use the demo seller and can be paid for only where examples can (never on the live site).
    if (!r.userId && !examplesBuyable()) return fail('This is an example profile. We made it to show how hiring works, so it cannot be hired.', 400);
    if (r.userId) {
      if (await accountLockedOut(r.userId)) return fail('That developer is not available.', 404);
      if (!buyerId) return fail('Sign in to hire a developer. Developers are paid into their account, so every buyer needs one too.', 401);
      if (buyerId === r.userId) return fail('This is your own profile.', 400);
    }
    const trial = b.pack === 'Trial';
    const pack = trial ? trialOf(r.dev) : r.dev.packs.find((p) => p.name === b.pack);
    if (!pack) return fail('Pick a package.');
    const price = pack.price * 100;
    // A finished trial with this developer takes its fee off a full project, if the developer credits trials.
    const credit = !trial && creditsTrial(r.dev) ? await findTrialCredit(buyerId, r.dev.id, price) : null;
    const make = (c: typeof credit) =>
      createOrder({
        kind: trial ? 'trial' : 'custom',
        pkg: 'custom',
        deliveryType: 'download',
        title: trial ? `${r.dev.name}: ${pack.days}-day paid trial` : `${r.dev.name}: ${pack.name} package`,
        devKey: r.dev.id,
        brief,
        lines: [[c ? `${pack.name} package, trial credit applied` : `${pack.name} package`, price - (c?.creditCents ?? 0)]],
        days: pack.days,
        buyerId,
        sellerId: r.userId ?? null,
        demo: !r.userId,
        trialCreditFor: c?.trialId,
      });
    let o;
    try {
      o = await make(credit);
    } catch (e) {
      if (!credit) throw e;
      o = await make(null); // the credit was claimed by another order a moment ago
    }
    return NextResponse.json({ id: o.id, pay: `/pay/${o.id}` });
  }

  const q = await quoteSite(b);
  if ('error' in q) return fail(q.error);
  const p = q.product;
  // A seller's own listing: only a signed-in buyer can buy it (the seller and the money need a real account on both sides), and not from yourself.
  if (q.sellerId) {
    if (!buyerId) return fail('Sign in to buy this. Sellers are paid into their account, so every buyer needs one too.', 401);
    if (buyerId === q.sellerId) return fail('This is your own listing.', 400);
  }
  const o = await createOrder({
    kind: 'product',
    pkg: isPkg(b.pkg) ? b.pkg : 'asis',
    deliveryType: p ? deliveryTypeOf(p) : 'live_site',
    licence: p ? licenceOf(p) : undefined,
    // What a digital listing promises from the purchase (support, new versions), kept on the order so a later edit cannot shorten it.
    supportDays: p ? infoOf(p)?.supportDays : undefined,
    updateDays: p ? infoOf(p)?.updateDays : undefined,
    githubUsername: q.github,
    title: q.title,
    productKey: q.productId,
    productId: q.productDbId,
    sellerId: q.sellerId,
    demo: !q.sellerId, // a seller's own listing is a real order (the payment provider is still the fake one until decision D1)
    lines: q.lines,
    days: q.days,
    buyerId,
    domain: q.domain,
    appName: q.appName,
    oses: q.oses,
    instant: q.instant,
    express: q.express,
  });
  return NextResponse.json({ id: o.id, pay: `/pay/${o.id}` });
}
