import { describe, expect, it } from 'vitest';
import type { Viewer } from '@/lib/messaging/rules';
import { closeTicket, openTicket, postMessage, readConversation, ticketsOf } from '@/lib/messaging/service';
import { getOrder } from '@/lib/orders/service';
import { gateFor } from '@/lib/release/gate';
import { approveRelease } from '@/lib/release/service';
import { entitlementFor } from '@/lib/release/store';
import { paidOrder } from './fixtures/paidOrder';

/*
 * SellOnBay 2.0 end to end, in process: request -> quotation (Super approval) -> acceptance -> manual payment -> reconciliation -> release
 * approval -> entitlement, then the admin-mediated channels and a support ticket on that same order. Demo mode has no accounts, so the
 * browser tests cannot reach the conversation routes; this is where the boundaries are checked on a real order.
 */
const support: Viewer = { id: 'support-1', role: 'admin', scopes: ['support'] };
const content: Viewer = { id: 'content-1', role: 'admin', scopes: ['content'] };

describe('SellOnBay 2.0 purchase chain with messaging', () => {
  it('nothing reaches the buyer before release; afterwards one entitlement; messages stay in their channels', async () => {
    const { buyer, sellerId, orderId } = await paidOrder(true);
    const b: Viewer = { id: buyer, role: 'buyer' };
    const s: Viewer = { id: sellerId, role: 'seller' };
    const o = await getOrder(orderId);
    expect(o?.state).toBe('release_pending');
    expect(await gateFor({ id: orderId, status: o!.state, quotationId: o!.quotationId, releaseApprovedAt: o!.releaseApprovedAt })).toMatchObject({ allowed: false });

    // Before release the buyer can ask SellOnBay; the seller cannot see it.
    expect((await postMessage(b, 'order', orderId, 'buyer_admin', 'When do I get the files?')).ok).toBe(true);
    expect((await postMessage(support, 'order', orderId, 'internal', 'Pinned version checked.')).ok).toBe(true);
    const sv = await readConversation(s, 'order', orderId);
    expect(sv.ok && sv.value.messages).toEqual([]);

    expect((await approveRelease('delivery-1', orderId, 'Checked the pinned version.')).ok).toBe(true);
    const after = await getOrder(orderId);
    expect(await gateFor({ id: orderId, status: after!.state, quotationId: after!.quotationId, releaseApprovedAt: after!.releaseApprovedAt })).toEqual({ allowed: true });
    expect((await entitlementFor(orderId))?.buyerId).toBe(buyer);

    // The buyer never sees internal notes or the seller channel; strangers and Content admins see nothing.
    const bv = await readConversation(b, 'order', orderId);
    expect(bv.ok && bv.value.messages.map((m) => m.channel)).toEqual(['buyer_admin']);
    expect(await readConversation({ id: 'other-buyer', role: 'buyer' }, 'order', orderId)).toMatchObject({ ok: false, status: 404 });
    expect(await readConversation({ id: 'other-seller', role: 'seller' }, 'order', orderId)).toMatchObject({ ok: false, status: 404 });
    expect(await readConversation(content, 'order', orderId)).toMatchObject({ ok: false, status: 404 });
  });

  it('a ticket can name only the opener own order; it stays between the opener and Support', async () => {
    const { buyer, sellerId, orderId } = await paidOrder(true);
    const b: Viewer = { id: buyer, role: 'buyer' };
    expect(await openTicket({ id: 'other-buyer', role: 'buyer' }, { subject: 'About an order', body: 'This is not my order.', orderId })).toMatchObject({ ok: false, status: 404 });
    expect(await openTicket({ id: 'other-seller', role: 'seller' }, { subject: 'About an order', body: 'This is not my order.', orderId })).toMatchObject({ ok: false, status: 404 });
    const sellerTicket = await openTicket({ id: sellerId, role: 'seller' }, { subject: 'Payout timing', body: 'When is this sale paid out?', orderId });
    expect(sellerTicket.ok).toBe(true);
    const t = await openTicket(b, { subject: 'Licence question', body: 'Can I use it for two clients?', orderId });
    expect(t.ok).toBe(true);
    if (!t.ok || !sellerTicket.ok) return;
    // The buyer cannot read the seller's ticket about the same order, and the reverse.
    expect(await readConversation(b, 'ticket', sellerTicket.value.id)).toMatchObject({ ok: false, status: 404 });
    expect(await readConversation({ id: sellerId, role: 'seller' }, 'ticket', t.value.id)).toMatchObject({ ok: false, status: 404 });
    expect((await ticketsOf(b)).map((x) => x.id)).toEqual([t.value.id]);
    expect((await ticketsOf(support)).map((x) => x.id)).toEqual(expect.arrayContaining([t.value.id, sellerTicket.value.id]));
    // A buyer cannot reopen; only Support sets other statuses.
    expect(await closeTicket(b, t.value.id, 'open')).toMatchObject({ ok: false });
    expect((await closeTicket(support, t.value.id, 'waiting_user')).ok).toBe(true);
  });
});
