import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { getOrder } from '@/lib/orders/service';
import { approveRelease, authoriseWork, entitlementAction, submitDelivery } from '@/lib/release/service';
import { canMove, checkPolicy, triage } from '@/lib/revisions/rules';
import { buyerRevisionAnswer, decidePolicy, proposePolicy, releaseRevision, requestRevision, revisionSummary, returnRevision, submitRevisionWork, triageRevision } from '@/lib/revisions/service';
import { memRequestable } from '@/lib/requests/products';
import { acceptQuote, adminRequestAction, buyerRequestAction, draftQuote, issueQuote, submitRequest, superDecision } from '@/lib/requests/service';
import { getQuote, getRequest } from '@/lib/requests/store';
import { paidOrder } from './fixtures/paidOrder';

const terms1 = { revisions: { included: 1, windowDays: 14, scope: 'Text, colour and layout changes on existing pages.', extraPriceCents: 2500 } };
const reqs = 'Add a second language (Bengali) to the five existing pages, with a language switch in the header and translated menu items.';

/* A released work order (live site): the seller's delivery approved by Delivery. */
async function releasedWorkOrder(opts: Parameters<typeof paidOrder>[1] = {}) {
  const p = await paidOrder(false, opts);
  await authoriseWork('delivery-1', p.orderId);
  const s = await submitDelivery(p.sellerId, p.orderId, { note: 'The site is live at the domain with the buyer texts.' });
  if (!s.ok) throw new Error(s.error);
  const r = await approveRelease('delivery-1', p.orderId, 'Checked the live site.');
  if (!r.ok) throw new Error(r.error);
  return p;
}
const ask = (buyer: string, orderId: string, hint: 'defect' | 'change' = 'change', description = 'Please change the header colour to dark blue on all pages.') =>
  requestRevision(buyer, orderId, { description, hint, consent: true });

describe('revision rules (pure)', () => {
  it('checks policies', () => {
    expect(checkPolicy({ included: 2, windowDays: 30, scope: 'Small text changes.', extraPriceCents: 1500 }).ok).toBe(true);
    expect(checkPolicy({ included: 2, windowDays: 0, scope: 'Small text changes.' })).toMatchObject({ ok: false });
    expect(checkPolicy({ included: 2, windowDays: 10, scope: '' })).toMatchObject({ ok: false });
    expect(checkPolicy({ included: 51, windowDays: 10, scope: 'x'.repeat(10) })).toMatchObject({ ok: false });
    expect(checkPolicy({ included: 0, windowDays: 0, scope: '', supportTerms: 'Email me at jo@gmail.com' })).toMatchObject({ ok: false });
  });
  it('defects are always taken and never counted; included changes need window and allowance', () => {
    const t = terms1.revisions;
    const now = 1_000_000_000_000;
    expect(triage('defect', null, { used: 0, releasedAt: 0, now })).toEqual({ ok: true, to: 'assigned', counts: false });
    expect(triage('defect', { ...t, included: 0 }, { used: 5, releasedAt: 0, now })).toMatchObject({ ok: true, counts: false });
    expect(triage('included', t, { used: 0, releasedAt: now - DAY_MS, now })).toEqual({ ok: true, to: 'assigned', counts: true });
    expect(triage('included', t, { used: 1, releasedAt: now - DAY_MS, now })).toMatchObject({ ok: false, error: expect.stringMatching(/used up/) });
    expect(triage('included', t, { used: 0, releasedAt: now - 15 * DAY_MS, now })).toMatchObject({ ok: false, error: expect.stringMatching(/window/) });
    expect(triage('included', null, { used: 0, releasedAt: now, now })).toMatchObject({ ok: false });
    expect(triage('paid', null, { used: 0, releasedAt: now, now })).toEqual({ ok: true, to: 'quoted', counts: false });
    expect(canMove('submitted', 'delivered')).toBe(false);
    expect(canMove('release_pending', 'delivered')).toBe(true);
    expect(canMove('assigned', 'delivered')).toBe(false); // never without the release step
  });
});

describe('revision policies', () => {
  it('the seller proposes, Catalog approves, and quotations take the approved terms', async () => {
    let policyProduct = '';
    const p = await paidOrder(true, {
      beforeQuote: async (productId, sellerId) => {
        policyProduct = productId;
        expect(await proposePolicy('someone-else', productId, { included: 2, windowDays: 30, scope: 'Small text changes.' })).toMatchObject({ ok: false, status: 404 });
        const pr = await proposePolicy(sellerId, productId, { included: 2, windowDays: 30, scope: 'Small text changes.', extraPriceCents: 1500 });
        if (!pr.ok) throw new Error(pr.error);
        expect(await decidePolicy('catalog-1', pr.value.id, 'reject', '')).toMatchObject({ ok: false, status: 400 });
        expect((await decidePolicy('catalog-1', pr.value.id, 'approve', 'Fine.')).ok).toBe(true);
        expect(await decidePolicy('catalog-1', pr.value.id, 'approve', 'again')).toMatchObject({ ok: false, status: 409 });
      },
    });
    expect(policyProduct).not.toBe('');
    const o = await getOrder(p.orderId);
    const q = await getQuote(o!.quotationId!);
    expect(q?.terms.revisions).toEqual({ included: 2, windowDays: 30, scope: 'Small text changes.', extraPriceCents: 1500 });
  });
});

describe('revisions on a released order', () => {
  it('an included change: buyer asks, admin decides, seller works, Delivery releases, buyer confirms', async () => {
    const { buyer, sellerId, orderId } = await releasedWorkOrder({ terms: terms1 });
    expect(await requestRevision(buyer, orderId, { description: 'Please change the header colour.', hint: 'change', consent: false })).toMatchObject({ ok: false });
    expect(await ask('other-buyer', orderId)).toMatchObject({ ok: false, status: 404 });
    expect(await ask(buyer, orderId, 'change', 'Call me on 555 123 4567 about it please')).toMatchObject({ ok: false, status: 422 });
    const r = await ask(buyer, orderId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await ask(buyer, orderId)).toMatchObject({ ok: false, status: 409 }); // one open at a time
    expect(await submitRevisionWork(sellerId, r.value.id, { note: 'Changed the header colour.' })).toMatchObject({ ok: false, status: 409 }); // not decided yet
    expect((await triageRevision('delivery-1', r.value.id, { kind: 'included', note: 'Included in your terms; the seller will do it.' })).ok).toBe(true);
    expect(await submitRevisionWork('other-seller', r.value.id, { note: 'Changed the header colour.' })).toMatchObject({ ok: false, status: 404 });
    expect((await submitRevisionWork(sellerId, r.value.id, { note: 'Changed the header colour on all pages.' })).ok).toBe(true);
    expect(await returnRevision('delivery-1', r.value.id, 'no')).toMatchObject({ ok: false, status: 400 });
    expect((await returnRevision('delivery-1', r.value.id, 'The footer still uses the old colour.')).ok).toBe(true);
    expect((await submitRevisionWork(sellerId, r.value.id, { note: 'Header and footer now dark blue.' })).ok).toBe(true);
    expect((await releaseRevision('delivery-1', r.value.id, 'Checked the live site.')).ok).toBe(true);
    expect(await buyerRevisionAnswer('other-buyer', r.value.id, 'done', '')).toMatchObject({ ok: false, status: 404 });
    expect((await buyerRevisionAnswer(buyer, r.value.id, 'done', '')).ok).toBe(true);
    const sum = await revisionSummary(orderId);
    expect(sum.used).toBe(1);
    // The allowance is used up: another change can only be a paid one, while a defect is still free.
    const r2 = await ask(buyer, orderId);
    if (!r2.ok) throw new Error(r2.error);
    expect(await triageRevision('delivery-1', r2.value.id, { kind: 'included', note: 'Trying the included path.' })).toMatchObject({ ok: false, status: 409 });
    expect((await triageRevision('delivery-1', r2.value.id, { kind: 'defect', note: 'This is a fault in the delivered site.' })).ok).toBe(true);
    expect((await revisionSummary(orderId)).used).toBe(1); // defects are never counted
  });

  it('"not done" closes the released revision and opens a follow-up that is never counted again', async () => {
    const { buyer, sellerId, orderId } = await releasedWorkOrder({ terms: terms1 });
    const r = await ask(buyer, orderId);
    if (!r.ok) throw new Error(r.error);
    await triageRevision('delivery-1', r.value.id, { kind: 'included', note: 'Included in your terms.' });
    await submitRevisionWork(sellerId, r.value.id, { note: 'Changed the header colour.' });
    await releaseRevision('delivery-1', r.value.id, 'ok');
    expect(await buyerRevisionAnswer(buyer, r.value.id, 'not_done', 'short')).toMatchObject({ ok: false, status: 400 });
    const f = await buyerRevisionAnswer(buyer, r.value.id, 'not_done', 'The menu is still the old colour on phones.');
    expect(f.ok && f.value).toMatchObject({ status: 'assigned', countsAllowance: false, followsId: r.value.id });
    const sum = await revisionSummary(orderId);
    expect(sum.revisions.find((x) => x.id === r.value.id)).toMatchObject({ status: 'closed', releasedAt: expect.any(Number) });
    expect(sum.used).toBe(1);
  });

  it('nothing is released while the order entitlement is suspended', async () => {
    const { buyer, sellerId, orderId } = await releasedWorkOrder();
    const r = await ask(buyer, orderId, 'defect', 'The contact form does not send anything when I press the button.');
    if (!r.ok) throw new Error(r.error);
    await triageRevision('delivery-1', r.value.id, { kind: 'defect', note: 'A fault; the seller will fix it.' });
    await submitRevisionWork(sellerId, r.value.id, { note: 'Fixed the form handler.' });
    expect((await entitlementAction('delivery-1', orderId, 'suspend', 'Checking a payment question.')).ok).toBe(true);
    expect(await releaseRevision('delivery-1', r.value.id, 'ok')).toMatchObject({ ok: false, status: 409 });
  });

  it('a paid change becomes a linked custom request: buyer confirms, quoted with the seller plan, paid like any order', async () => {
    const { buyer, sellerId, orderId } = await releasedWorkOrder();
    const r = await ask(buyer, orderId, 'change', 'Please add a Bengali version of all pages with a language switch.');
    if (!r.ok) throw new Error(r.error);
    expect(await triageRevision('delivery-1', r.value.id, { kind: 'feature', note: 'This is new work; we will quote it.' })).toMatchObject({ ok: false, status: 400 }); // needs requirements
    const t = await triageRevision('delivery-1', r.value.id, { kind: 'feature', note: 'This is new work; we will quote it.', requirements: reqs });
    expect(t.ok && t.value).toMatchObject({ status: 'quoted', countsAllowance: false });
    if (!t.ok) return;
    const lr = await getRequest(t.value.requestId!);
    expect(lr).toMatchObject({ kind: 'custom_dev', parentOrderId: orderId, assignedSellerId: sellerId, status: 'under_review', verifiedRequirements: reqs });
    expect((await buyerRequestAction(buyer, lr!.id, 'confirm_requirements')).ok).toBe(true);
    const d = await draftQuote('admin-1', lr!.id, {
      lines: [{ label: 'Bengali version', cents: 10_000, kind: 'revision' }],
      terms: { deliveryDays: 3 },
      overrideReason: 'Paid change, no listed price.',
    });
    if (!d.ok) throw new Error(d.error);
    expect(d.value).toMatchObject({ ownerType: 'seller', sellerId });
    expect(d.value.feeCents).toBe(1500); // Free plan: 15% on a paid revision line (O-2)
    await issueQuote('admin-1', d.value.id);
    await superDecision('super-1', d.value.id, 'approve', 'Paid change agreed.');
    const a = await acceptQuote(buyer, d.value.id);
    if (!a.ok) throw new Error(a.error);
    const child = await getOrder(a.value.orderId);
    expect(child).toMatchObject({ kind: 'custom', sellerId, state: 'awaiting_payment', deliveryType: 'live_site' });
    expect(child?.title).toMatch(/^Revision: /);
  });
});

describe('custom development assignment (Blueprint 5.7)', () => {
  it('the developer is chosen before the quotation; the quotation records that seller and plan', async () => {
    const b = `buyer-${crypto.randomUUID().slice(0, 6)}`;
    const dev = `dev-${crypto.randomUUID().slice(0, 6)}`;
    const r = await submitRequest(b, { licenceTier: 'single_project', package: 'asis', intendedUse: 'For my bakery.', consent: true, kind: 'custom_dev', requirements: reqs });
    if (!r.ok) throw new Error(r.error);
    expect(await adminRequestAction('admin-1', r.value.id, 'assign', { sellerId: b })).toMatchObject({ ok: false, status: 400 }); // not the buyer
    expect((await adminRequestAction('admin-1', r.value.id, 'assign', { sellerId: dev })).ok).toBe(true);
    await adminRequestAction('admin-1', r.value.id, 'review', {});
    await adminRequestAction('admin-1', r.value.id, 'propose_requirements', { requirements: reqs });
    await buyerRequestAction(b, r.value.id, 'confirm_requirements');
    const d = await draftQuote('admin-1', r.value.id, { lines: [{ label: 'Build', cents: 50_000, kind: 'custom' }], terms: { deliveryDays: 10 }, overrideReason: 'Custom job.' });
    if (!d.ok) throw new Error(d.error);
    expect(d.value).toMatchObject({ ownerType: 'seller', sellerId: dev, feeCents: 7500 });
    expect(await adminRequestAction('admin-1', r.value.id, 'assign', { sellerId: null })).toMatchObject({ ok: false, status: 409 }); // open quotation
    expect(await adminRequestAction('admin-1', r.value.id, 'assign', {})).toMatchObject({ ok: false });
  });
  it('only custom development requests are assigned', async () => {
    const id = crypto.randomUUID();
    memRequestable({
      id,
      slug: `asg-${id.slice(0, 6)}`,
      name: 'Kit',
      sellerId: 's-asg',
      ownerType: 'seller',
      status: 'live',
      platform: 'digital',
      deliveryType: 'download',
      deliveryDays: 3,
      deliveryHours: null,
      supportDays: 0,
      updateDays: 0,
      priceCents: 1000,
      setupCents: null,
      customCents: null,
      expressCents: null,
      expressHelps: true,
      latestVersionId: crypto.randomUUID(),
    });
    const r = await submitRequest('b-asg', { licenceTier: 'single_project', package: 'asis', intendedUse: 'For my clients.', consent: true, product: `asg-${id.slice(0, 6)}` });
    if (!r.ok) throw new Error(r.error);
    expect(await adminRequestAction('admin-1', r.value.id, 'assign', { sellerId: 'dev-x' })).toMatchObject({ ok: false, status: 400 });
  });
});
