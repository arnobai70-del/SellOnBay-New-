import 'server-only';
import { domainProvider, mayOfferNewDomain } from '../providers/domain';
import { canUseDemoPayment } from '../commerce/demoPaymentPolicy';
import type { VerifiedEvent } from '../providers/payment/types';
import { supabaseConfigured } from '../supabase/env';
import { createAdminClient } from '../supabase/server';
import { fundExtra, getExtra, listExtras } from './extra';
import { cancel, ensureLedger, fund, getOrder, move } from './service';
import { bump } from '../metrics';
import { audit } from '../admin/audit';
import { banForChargeback } from '../clean';
import { notifyAdmins } from '../notify';

/*
 * What a payment provider's events do to orders. Each event id is claimed first: the same event twice (providers retry, attackers replay)
 * changes nothing. If applying fails, the claim is released so the provider's retry can succeed. An event that does not match the order
 * (wrong amount, unknown order) is rejected and never funds anything.
 */
export type Outcome = { status: 'applied' | 'duplicate' | 'ignored' | 'rejected'; reason?: string };

const memClaims: Set<string> = ((globalThis as { __webhookClaims?: Set<string> }).__webhookClaims ??= new Set());

async function claim(provider: string, ev: VerifiedEvent): Promise<boolean> {
  const key = `${provider}:${ev.id}`;
  if (!supabaseConfigured) {
    if (memClaims.has(key)) return false;
    memClaims.add(key);
    return true;
  }
  const { error } = await createAdminClient().from('webhook_events').insert({ provider, event_id: ev.id, type: ev.type });
  if (!error) return true;
  if (error.code === '23505') return false; // already claimed
  // A configured database must persist webhook IDs. A memory fallback would
  // allow event replays across restarts or instances and is unsafe for money.
  throw new Error('Could not record the event: ' + error.message);
}
async function release(provider: string, ev: VerifiedEvent) {
  memClaims.delete(`${provider}:${ev.id}`);
  if (supabaseConfigured) await createAdminClient().from('webhook_events').delete().eq('provider', provider).eq('event_id', ev.id);
}

async function moneyNeedsAdmin(order: { id: string; title: string }, ev: VerifiedEvent, what: string) {
  await audit(null, 'payment_needs_admin', 'order', order.id, { type: ev.type, amountCents: ev.amountCents, ref: ev.ref, what });
  await notifyAdmins('abuse_alert', { what: 'a payment needs a look', detail: `${order.title}: ${(ev.amountCents / 100).toFixed(2)} USD, ${what}` }, `payment:${ev.id}`);
}

async function apply(provider: string, ev: VerifiedEvent): Promise<Outcome> {
  const order = await getOrder(ev.orderId);
  if (!order) return { status: 'rejected', reason: 'unknown order' };
  // Defense in depth: no fake event, including a signed webhook or extra-work
  // event, can change a real seller or developer order's financial state.
  if (provider === 'fake' && !canUseDemoPayment(order)) return { status: 'rejected', reason: 'test gateway cannot modify a real order' };

  if (ev.type === 'payment.succeeded' && ev.changeRequestId) {
    // The extra must belong to the order the event names: otherwise a demo order's event could fund a real order's extra.
    if ((await getExtra(ev.changeRequestId))?.orderId !== order.id) return { status: 'rejected', reason: 'the extra work belongs to another order' };
    const r = await fundExtra(ev.changeRequestId, ev.amountCents, ev.ref);
    if (!r.ok) return r.status === 422 ? { status: 'rejected', reason: r.error } : { status: 'ignored', reason: r.error };
    await ensureLedger((await getOrder(order.id)) ?? order);
    return { status: 'applied' };
  }

  if (ev.type === 'payment.succeeded') {
    if (order.state !== 'awaiting_payment') {
      // Money arrived for an order that was cancelled or already paid: it must go back, or the buyer is charged with nothing in escrow.
      if (ev.ref !== order.payment?.ref) await moneyNeedsAdmin(order, ev, `a payment arrived but the order is ${order.state}. Refund it at the provider.`);
      return { status: 'ignored', reason: `order is ${order.state}` };
    }
    if (ev.amountCents !== order.priceCents) return { status: 'rejected', reason: 'amount does not match the order' };
    let domain = order.domain;
    // Never fund a new-domain purchase with an unverified registrar, even if
    // an old demo order already has a fabricated registration reference.
    if (domain?.source === 'new' && !mayOfferNewDomain(domainProvider())) {
      return { status: 'rejected', reason: 'No real registrar is connected. Domain registration is unavailable.' };
    }
    if (domain?.source === 'new' && !domain.ref) {
      const reg = await domainProvider().register({ domain: domain.name });
      domain = { ...domain, ref: reg.ref, expires: reg.expires };
    }
    const r = await fund(order.id, { ref: ev.ref, brand: ev.card?.brand ?? '', last4: ev.card?.last4 ?? '' }, domain, order.buyerId);
    return r.ok ? { status: 'applied' } : { status: 'ignored', reason: r.error };
  }

  if (ev.type === 'chargeback.lost') {
    // The buyer's bank took the money back. The buyer is banned for good; the money (the seller's share, a refund) is decided by an admin in Disputes.
    await bump('refunds');
    const banned = order.buyerId ? await banForChargeback(null, order.buyerId, order.id) : 'skipped';
    await audit(null, 'chargeback_lost', 'order', order.id, { amountCents: ev.amountCents, ref: ev.ref, buyerBanned: banned === 'banned' });
    await notifyAdmins(
      'abuse_alert',
      {
        what: 'a chargeback was lost',
        detail: `${order.title}: ${(ev.amountCents / 100).toFixed(2)} USD. The buyer ${banned === 'banned' ? 'was banned for good' : 'could not be banned automatically'}. The seller's money and any refund need a decision in Disputes.`,
      },
      `chargeback:${ev.id}`,
    );
    return { status: 'applied' };
  }

  if (ev.type === 'payment.failed') {
    await bump('failed_payments');
    return { status: 'ignored', reason: ev.type };
  }

  if (ev.type === 'refund.succeeded') {
    // Only a refund of everything still paid (the price and any funded extra work) ends the order: the ledger then gives all of the escrow back.
    // A smaller refund made at the provider is for an admin to record, not a full refund.
    const extras = (await listExtras(order.id)).filter((c) => c.state === 'funded').reduce((s, c) => s + c.priceCents, 0);
    if (ev.amountCents < order.priceCents + extras - order.refundedCents) {
      await moneyNeedsAdmin(order, ev, 'a partial refund was made at the payment provider. The order was not changed.');
      return { status: 'ignored', reason: 'partial refund' };
    }
    if (order.state === 'disputed') {
      const r = await move(order.id, 'refunded', { actorId: null, event: 'refunded', meta: { ref: ev.ref, amountCents: ev.amountCents } });
      return r.ok ? { status: 'applied' } : { status: 'ignored', reason: r.error };
    }
    if (['funded', 'in_delivery', 'overdue'].includes(order.state)) {
      const r = await cancel(order.id, null, 'refunded by the payment provider');
      return r.ok ? { status: 'applied' } : { status: 'ignored', reason: r.error };
    }
    return { status: 'ignored', reason: `order is ${order.state}` };
  }

  return { status: 'ignored', reason: ev.type }; // payment.failed and payout.paid need no change to the order yet
}

export async function handlePaymentEvent(provider: string, ev: VerifiedEvent): Promise<Outcome> {
  if (!(await claim(provider, ev))) return { status: 'duplicate' };
  try {
    const out = await apply(provider, ev);
    if (out.status === 'rejected') await release(provider, ev); // a rejected event may be retried after the cause is fixed
    return out;
  } catch (e) {
    await release(provider, ev);
    throw e;
  }
}
