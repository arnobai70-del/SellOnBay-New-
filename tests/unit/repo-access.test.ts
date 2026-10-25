import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { CONFIG, DAY_MS, HOUR_MS } from '@/lib/config';
import { notificationsFor } from '@/lib/notify';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { cancel, confirmAccess, createOrder, getOrder, handoverSent } from '@/lib/orders/service';
import { checklist, confirmRevoked, inviteReminders, inviteState, pendingForSeller, remindSeller, requestRevocation, resendInvite, sellerRemoved, taskOf } from '@/lib/repoAccess';
import { decide, openDispute } from '@/lib/disputes';

let n = 0;
const GOOD = 'On the second screen the Send button does nothing, the console shows a 500 error.';
/* A funded repository order, the seller's invite sent when `invite` is true. */
const order = async (invite = true) => {
  const k = ++n;
  const o = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'repo_access',
    title: `Repo product ${k}`,
    lines: [['Product', 8000]],
    days: 1,
    buyerId: `repo-b${k}`,
    sellerId: `repo-s${k}`,
    productKey: `repo-product-${k}`,
    githubUsername: 'octocat',
    demo: false,
  });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  if (invite) expect((await handoverSent(o.id, `repo-s${k}`)).ok).toBe(true);
  return { id: o.id, buyer: `repo-b${k}`, seller: `repo-s${k}` };
};

describe('the invite and its time limit', () => {
  it('is dated when sent, runs out after the GitHub limit, and only counts while the buyer has not confirmed', async () => {
    const { id } = await order();
    const o = (await getOrder(id))!;
    const s = (await inviteState(o))!;
    expect(s.expiresAt - s.invitedAt).toBe(CONFIG.repo.inviteDays * DAY_MS);
    expect(s.expired).toBe(false);
    expect((await inviteState(o, s.expiresAt + 1))!.expired).toBe(true);
    expect(await inviteState({ ...o, deliveryType: 'download' })).toBeNull();
    const none = await order(false);
    expect(await inviteState((await getOrder(none.id))!)).toBeNull();
  });
  it('the buyer is reminded a day before it runs out and the seller after, once each', async () => {
    const { id, buyer, seller } = await order();
    const o = (await getOrder(id))!;
    const s = (await inviteState(o))!;
    await inviteReminders(o, s.invitedAt + 2 * DAY_MS); // plenty of time left: nothing
    expect((await notificationsFor(buyer)).some((x) => x.kind === 'repo_invite_expiring')).toBe(false);
    await inviteReminders(o, s.expiresAt - CONFIG.repo.reminderHours * HOUR_MS + 1000);
    await inviteReminders(o, s.expiresAt - HOUR_MS);
    expect((await notificationsFor(buyer)).filter((x) => x.kind === 'repo_invite_expiring')).toHaveLength(1);
    await inviteReminders(o, s.expiresAt + 1000);
    await inviteReminders(o, s.expiresAt + 2000);
    expect((await notificationsFor(seller)).filter((x) => x.kind === 'repo_invite_expired')).toHaveLength(1);
    expect((await notificationsFor(buyer)).filter((x) => x.kind === 'repo_invite_lapsed')).toHaveLength(1);
  });
  it('access is confirmed by itself only after the invite has run out, so it can be sent again first', () => {
    expect(CONFIG.repo.autoConfirmDays).toBeGreaterThan(CONFIG.repo.inviteDays);
  });
  it('the seller can send it again (a new date, the buyer is told), a limited number of times, and only for their own order', async () => {
    const { id, buyer, seller } = await order();
    expect((await resendInvite(id, 'not-the-seller')).ok).toBe(false);
    const before = (await inviteState((await getOrder(id))!))!.invitedAt;
    expect((await resendInvite(id, seller, before + 6 * DAY_MS)).ok).toBe(true);
    const after = (await inviteState((await getOrder(id))!, before + 6 * DAY_MS))!;
    expect(after.invitedAt).toBe(before + 6 * DAY_MS);
    expect(after.resends).toBe(1);
    expect((await notificationsFor(buyer)).some((x) => x.kind === 'repo_invite_resent')).toBe(true);
    for (let i = 1; i < CONFIG.repo.maxResends; i++) expect((await resendInvite(id, seller)).ok).toBe(true);
    expect(await resendInvite(id, seller)).toMatchObject({ ok: false, status: 429 });
    const first = await order(false);
    expect(await resendInvite(first.id, first.seller)).toMatchObject({ ok: false, status: 409 }); // the first invite is "I sent the invite"
    const done = await order();
    await confirmAccess(done.id, done.buyer);
    expect(await resendInvite(done.id, done.seller)).toMatchObject({ ok: false, status: 409 }); // already open for the buyer
  });
});

describe('taking the buyer out of the repository after a refund', () => {
  it('a cancelled order after the invite asks the seller; before the invite nothing is asked', async () => {
    const early = await order(false);
    await cancel(early.id, early.buyer, 'changed my mind');
    expect(await taskOf(early.id)).toBeNull();
    expect((await notificationsFor(early.seller)).some((x) => x.kind === 'repo_revoke_request')).toBe(false);
    const late = await order();
    expect((await cancel(late.id, late.buyer, 'changed my mind')).ok).toBe(true);
    expect((await taskOf(late.id))?.revokeState).toBe('pending');
    const asked = (await notificationsFor(late.seller)).filter((x) => x.kind === 'repo_revoke_request');
    expect(asked).toHaveLength(1);
    expect(asked[0].text).toMatch(/octocat/);
    expect(await requestRevocation((await getOrder(late.id))!)).toBe(false); // asked once
  });
  it('a refund decided in a dispute asks the seller too', async () => {
    const { id, buyer, seller } = await order();
    await confirmAccess(id, buyer);
    const d = await openDispute(id, buyer, { reason: 'not_working', detail: GOOD });
    if (!d.ok) throw new Error(d.error);
    expect((await decide(d.value.id, 'admin-1', { decision: 'refund_full', liability: 'seller' })).ok).toBe(true);
    expect((await taskOf(id))?.revokeState).toBe('pending');
    expect((await notificationsFor(seller)).some((x) => x.kind === 'repo_revoke_request')).toBe(true);
  });
  it('the seller says it is done, the admins are told, an admin confirms with a note, and both sides hear it', async () => {
    const { id, buyer, seller } = await order();
    await cancel(id, buyer, 'changed my mind');
    expect((await sellerRemoved(id, 'someone-else')).ok).toBe(false);
    expect((await sellerRemoved(id, seller)).ok).toBe(true);
    expect(await sellerRemoved(id, seller)).toMatchObject({ ok: false, status: 409 });
    expect((await taskOf(id))?.revokeState).toBe('seller_done');
    expect((await checklist()).find((c) => c.orderId === id)?.state).toBe('seller_done');
    expect((await confirmRevoked('admin-1', id, 'no')).ok).toBe(false); // how it was checked is needed
    expect((await confirmRevoked('admin-1', id, 'Opened the repository settings: the user is gone.')).ok).toBe(true);
    expect(await confirmRevoked('admin-1', id, 'Again, for the record.')).toMatchObject({ ok: false, status: 409 });
    expect((await taskOf(id))?.revokeState).toBe('confirmed');
    expect((await checklist()).some((c) => c.orderId === id)).toBe(false);
    for (const who of [buyer, seller]) expect((await notificationsFor(who)).some((x) => x.kind === 'repo_revoke_confirmed')).toBe(true);
    const log = (await auditList(400)).filter((e) => e.targetRef === id).map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(['repo_revoke_requested', 'repo_revoke_seller_done', 'repo_revoke_confirmed']));
  });
  it('the seller still has it on their list until they say so, an admin can remind them once a day and confirm without their word', async () => {
    const { id, buyer, seller } = await order();
    await cancel(id, buyer, 'changed my mind');
    expect((await pendingForSeller(seller)).map((c) => c.orderId)).toEqual([id]);
    expect((await pendingForSeller('another-seller')).length).toBe(0);
    expect((await remindSeller('admin-1', id)).ok).toBe(true);
    expect((await remindSeller('admin-1', id)).ok).toBe(true);
    expect((await notificationsFor(seller)).filter((x) => x.kind === 'repo_revoke_request').length).toBe(2); // the first ask and one reminder today
    expect((await confirmRevoked('admin-1', id, 'The seller is not answering: I removed the invite myself.')).ok).toBe(true);
    expect((await pendingForSeller(seller)).length).toBe(0);
    expect(await remindSeller('admin-1', id)).toMatchObject({ ok: false });
  });
});
