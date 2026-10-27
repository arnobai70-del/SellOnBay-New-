import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { HOUR_MS } from '@/lib/config';
import { transition, type Order } from '@/lib/orders/machine';
import { createOrder, getOrder, tick } from '@/lib/orders/service';
import { orderStore } from '@/lib/orders/store';
import { reconcile, saveMethodAsAdmin, submitManualPayment } from '@/lib/payments/service';
import { gateFor } from '@/lib/release/gate';
import { releaseDueAt, releaseGate, slaState } from '@/lib/release/rules';
import { approveLegacyRelease, approveRelease, authoriseWork, cancelLegacyUnpaid, entitlementAction, legacyQueue, releaseJobs, returnToSeller, submitDelivery } from '@/lib/release/service';
import { entitlementFor } from '@/lib/release/store';
import { memRequestable } from '@/lib/requests/products';
import { acceptQuote, adminRequestAction, draftQuote, issueQuote, submitRequest } from '@/lib/requests/service';

/* A paid quotation order. readyMade: files only (download, as is); otherwise a work order (live site). */
async function paidOrder(readyMade: boolean) {
  const id = crypto.randomUUID();
  const sellerId = `seller-${id.slice(0, 6)}`;
  memRequestable({
    id,
    slug: `rel-${id.slice(0, 6)}`,
    name: readyMade ? 'Script pack' : 'Shop site',
    sellerId,
    ownerType: 'seller',
    status: 'live',
    platform: readyMade ? 'digital' : 'web',
    deliveryType: readyMade ? 'download' : 'live_site',
    deliveryDays: 3,
    deliveryHours: null,
    supportDays: 0,
    updateDays: 0,
    priceCents: 4900,
    setupCents: null,
    customCents: null,
    expressCents: null,
    expressHelps: true,
    latestVersionId: crypto.randomUUID(),
  });
  const buyer = `buyer-${id.slice(0, 6)}`;
  const r = await submitRequest(buyer, { licenceTier: 'multi_project', package: 'asis', intendedUse: 'For my clients.', consent: true, product: `rel-${id.slice(0, 6)}` });
  if (!r.ok) throw new Error(r.error);
  await adminRequestAction('admin-1', r.value.id, 'review', {});
  const d = await draftQuote('admin-1', r.value.id, { lines: [{ label: 'Item', cents: 4900, kind: 'product' }], terms: { deliveryDays: 3 }, overrideReason: 'Multi-project price.' });
  if (!d.ok) throw new Error(d.error);
  await issueQuote('admin-1', d.value.id);
  const { superDecision } = await import('@/lib/requests/service');
  await superDecision('super-1', d.value.id, 'approve', 'Multi-project licence agreed.');
  const a = await acceptQuote(buyer, d.value.id);
  if (!a.ok) throw new Error(a.error);
  const m = await saveMethodAsAdmin('finance-1', { kind: 'bank_transfer', label: `Bank ${id.slice(0, 4)}`, instructions: 'Pay to the account shown.', currency: 'USD', active: true }, 'Test method.');
  if (!m.ok) throw new Error(m.error);
  const s = await submitManualPayment(buyer, a.value.orderId, { methodId: m.value.id, reference: `T-${id.slice(0, 8)}`, amountCents: 4900, paidOn: '2026-10-20' }, null);
  if (!s.ok) throw new Error(s.error);
  const rc = await reconcile('finance-1', s.value.id, { amountReceivedCents: 4900, statementRef: 'ST-1', receivedAt: Date.now() - 1000 });
  if (!rc.ok) throw new Error(rc.error);
  return { buyer, sellerId, orderId: a.value.orderId };
}

describe('the gate (pure)', () => {
  it('a quotation order needs release approval, a released state and an active entitlement', () => {
    expect(releaseGate({ status: 'funded', quotationId: 'q' })).toEqual({ allowed: false, reason: 'not_released' });
    expect(releaseGate({ status: 'release_pending', quotationId: 'q' })).toEqual({ allowed: false, reason: 'not_released' });
    expect(releaseGate({ status: 'delivered', quotationId: 'q', releaseApprovedAt: 1, entitlement: 'active' })).toEqual({ allowed: true });
    expect(releaseGate({ status: 'delivered', quotationId: 'q', releaseApprovedAt: 1, entitlement: 'suspended' })).toMatchObject({ allowed: false });
    expect(releaseGate({ status: 'disputed', quotationId: 'q', releaseApprovedAt: 1, entitlement: 'active' })).toMatchObject({ allowed: false });
    expect(releaseGate({ status: 'accepted', quotationId: 'q', releaseApprovedAt: 1, entitlement: 'revoked' })).toEqual({ allowed: false, reason: 'revoked' });
  });
  it('legacy paid-but-undelivered orders wait for review; legacy delivered orders keep their access', () => {
    expect(releaseGate({ status: 'funded' })).toEqual({ allowed: false, reason: 'awaiting_review' });
    expect(releaseGate({ status: 'funded', releaseApprovedAt: 1 })).toEqual({ allowed: true });
    expect(releaseGate({ status: 'accepted' })).toEqual({ allowed: true });
  });
  it('the 12-hour target runs from the later of payment and files ready, 24/7; overdue only alerts', () => {
    expect(releaseDueAt(1000, 500)).toBe(1000 + 12 * HOUR_MS);
    expect(releaseDueAt(1000, 5000)).toBe(5000 + 12 * HOUR_MS);
    expect(slaState(12 * HOUR_MS, 0)).toBe('on_track');
    expect(slaState(12 * HOUR_MS, 10 * HOUR_MS)).toBe('due_soon');
    expect(slaState(12 * HOUR_MS, 12 * HOUR_MS)).toBe('overdue');
  });
});

describe('the machine refuses delivery without release approval', () => {
  it('a quotation order cannot go to delivered from anywhere but release_pending with an approval', () => {
    const o = { id: 'o', state: 'in_delivery', quotationId: 'q', lines: [], days: 1 } as unknown as Order;
    expect(() => transition(o, 'delivered', { now: 1 })).toThrow();
    expect(() => transition({ ...o, state: 'release_pending' }, 'delivered', { now: 1 })).toThrow();
    expect(transition({ ...o, state: 'release_pending', releaseApprovedAt: 1 }, 'delivered', { now: 2 }).order.state).toBe('delivered');
  });
});

describe('ready-made files', () => {
  it('paid -> waiting for release (12-hour target) -> explicit approval -> entitlement and licence; no access before', async () => {
    const { buyer, orderId } = await paidOrder(true);
    const o = (await getOrder(orderId))!;
    expect(o.state).toBe('release_pending');
    expect(o.releaseDueAt).toBe(o.fundedAt! + 12 * HOUR_MS);
    expect(o.dueAt).toBeUndefined();
    expect(await gateFor({ id: o.id, status: o.state, quotationId: o.quotationId, releaseApprovedAt: o.releaseApprovedAt })).toMatchObject({ allowed: false });
    expect(await returnToSeller('delivery-1', orderId, 'Nothing to return here.')).toMatchObject({ ok: false });
    const r = await approveRelease('delivery-1', orderId, 'Checked the pinned version.');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.order).toMatchObject({ state: 'delivered', releaseApprovedBy: 'delivery-1' });
    expect(r.value.entitlement).toMatchObject({ buyerId: buyer, licenceTier: 'multi_project', fileVersionId: o.fileVersionId, status: 'active' });
    const after = (await getOrder(orderId))!;
    expect(await gateFor({ id: after.id, status: after.state, quotationId: after.quotationId, releaseApprovedAt: after.releaseApprovedAt })).toEqual({ allowed: true });
    expect(await approveRelease('delivery-1', orderId, 'again')).toMatchObject({ ok: false, status: 409 });
    expect((await auditList(500)).some((e) => e.action === 'release_approved' && e.targetRef === orderId)).toBe(true);
  });
  it('revoking access stops downloads for good; suspend and resume work in between', async () => {
    const { orderId } = await paidOrder(true);
    await approveRelease('delivery-1', orderId, 'ok');
    const gate = async () => {
      const o = (await getOrder(orderId))!;
      return gateFor({ id: o.id, status: o.state, quotationId: o.quotationId, releaseApprovedAt: o.releaseApprovedAt });
    };
    expect((await entitlementAction('delivery-1', orderId, 'suspend', 'Checking a report.')).ok).toBe(true);
    expect((await gate()).allowed).toBe(false);
    expect((await entitlementAction('delivery-1', orderId, 'resume', 'Report was wrong.')).ok).toBe(true);
    expect((await gate()).allowed).toBe(true);
    expect((await entitlementAction('delivery-1', orderId, 'revoke', 'Licence breach confirmed.')).ok).toBe(true);
    expect(await gate()).toEqual({ allowed: false, reason: 'revoked' });
    expect(await entitlementAction('delivery-1', orderId, 'resume', 'Trying to undo.')).toMatchObject({ ok: false });
    expect((await entitlementFor(orderId))!.status).toBe('revoked');
  });
});

describe('work orders', () => {
  it('paid -> authorised (delivery time starts) -> seller delivers -> returned -> delivered again -> released', async () => {
    const { sellerId, orderId } = await paidOrder(false);
    expect((await getOrder(orderId))!.state).toBe('funded');
    expect(await submitDelivery(sellerId, orderId, { note: 'The site is live at the domain.' })).toMatchObject({ ok: false }); // not authorised yet
    const a = await authoriseWork('delivery-1', orderId);
    expect(a.ok && a.value).toMatchObject({ state: 'in_delivery', workAuthorisedAt: expect.any(Number), dueAt: expect.any(Number) });
    expect(await submitDelivery('other-seller', orderId, { note: 'The site is live at the domain.' })).toMatchObject({ ok: false, status: 404 });
    expect(await submitDelivery(sellerId, orderId, { note: 'short' })).toMatchObject({ ok: false, status: 400 });
    const s = await submitDelivery(sellerId, orderId, { note: 'The site is live at the domain with the buyer texts.' });
    expect(s.ok && s.value.state).toBe('release_pending');
    expect((await returnToSeller('delivery-1', orderId, 'Logo is missing on the home page.')).ok).toBe(true);
    expect((await getOrder(orderId))!.state).toBe('in_delivery');
    expect((await submitDelivery(sellerId, orderId, { note: 'Logo added to the home page and the footer.' })).ok).toBe(true);
    expect((await approveRelease('delivery-1', orderId, 'Checked the live site.')).ok).toBe(true);
  });
});

describe('scheduled reminders never release anything', () => {
  it('an order past its 12-hour target is counted as overdue and stays waiting', async () => {
    const { orderId } = await paidOrder(true);
    const o = (await getOrder(orderId))!;
    const r = await releaseJobs(o.releaseDueAt! + 1);
    expect(r.overdue).toBeGreaterThanOrEqual(1);
    expect((await getOrder(orderId))!.state).toBe('release_pending');
    expect((await tick((await getOrder(orderId))!, o.releaseDueAt! + 10 * HOUR_MS)).state).toBe('release_pending');
  });
});

describe('legacy orders (F-13, F-14)', () => {
  it('a legacy paid order waits for individual review; approval allows its files without changing its state', async () => {
    const o = await createOrder({
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'download',
      title: 'Old order',
      lines: [['Old', 3000]],
      days: 3,
      buyerId: 'legacy-buyer',
      sellerId: 'legacy-seller',
      productId: crypto.randomUUID(),
      demo: false,
    });
    const funded = transition(o, 'funded', { now: Date.now() });
    await (await orderStore()).apply(o, funded.order, funded.event);
    expect((await legacyQueue()).paid.some((x) => x.id === o.id)).toBe(true);
    expect((await gateFor({ id: o.id, status: 'funded' })).allowed).toBe(false);
    expect((await approveLegacyRelease('delivery-1', o.id, 'Reviewed: seller and files are fine.')).ok).toBe(true);
    const after = (await getOrder(o.id))!;
    expect(after.state).toBe('funded');
    expect((await gateFor({ id: after.id, status: after.state, releaseApprovedAt: after.releaseApprovedAt })).allowed).toBe(true);
  });
  it('a legacy unpaid order is cancelled after review, with nothing charged', async () => {
    const o = await createOrder({
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'download',
      title: 'Old unpaid',
      lines: [['Old', 3000]],
      days: 3,
      buyerId: 'legacy-buyer-2',
      sellerId: 'legacy-seller',
      productId: crypto.randomUUID(),
      demo: false,
    });
    expect((await legacyQueue()).unpaid.some((x) => x.id === o.id)).toBe(true);
    expect((await cancelLegacyUnpaid('delivery-1', o.id, 'Old checkout order, never paid.')).ok).toBe(true);
    expect((await getOrder(o.id))!.state).toBe('cancelled');
  });
});
