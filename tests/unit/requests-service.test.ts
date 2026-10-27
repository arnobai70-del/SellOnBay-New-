import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { DAY_MS } from '@/lib/config';
import { split } from '@/lib/ledger';
import { getOrder } from '@/lib/orders/service';
import { memRequestable } from '@/lib/requests/products';
import { acceptQuote, adminRequestAction, buyerRequestAction, draftQuote, expireDue, issueQuote, rejectQuote, submitRequest, superDecision, withdrawQuote } from '@/lib/requests/service';
import { getQuote, getRequest, quoteEvents, requestEvents } from '@/lib/requests/store';

const terms = { deliveryDays: 3, supportDays: 30, updateDays: 90, revisions: { included: 2, windowDays: 14, scope: 'Text, colours and images', extraPriceCents: 1500 } };
function product(over: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  const p = {
    id,
    slug: `bakery-${id.slice(0, 6)}`,
    name: 'Bakery site',
    sellerId: `seller-${id.slice(0, 6)}`,
    ownerType: 'seller' as const,
    status: 'live',
    platform: 'web',
    deliveryType: 'live_site' as const,
    deliveryDays: 3,
    deliveryHours: null,
    supportDays: 30,
    updateDays: 90,
    priceCents: 4900,
    setupCents: 3000,
    customCents: null,
    expressCents: 1500,
    expressHelps: true,
    latestVersionId: crypto.randomUUID(),
    ...over,
  };
  memRequestable(p);
  return p;
}
const buyer = () => `buyer-${Math.random().toString(36).slice(2, 8)}`;
const ask = { licenceTier: 'single_project', package: 'setup', intendedUse: 'A website for my bakery in Dhaka.', consent: true };

async function quoted(lines: unknown, p = product(), b = buyer()) {
  const r = await submitRequest(b, { ...ask, product: p.slug });
  if (!r.ok) throw new Error(r.error);
  await adminRequestAction('admin-1', r.value.id, 'review', {});
  const d = await draftQuote('admin-1', r.value.id, { lines, terms, overrideReason: 'Agreed with the buyer.' });
  if (!d.ok) throw new Error(d.error);
  return { p, b, req: r.value, quote: d.value };
}

describe('a purchase starts with a request (D-E)', () => {
  it('only for a live product with an approved file version; not for your own product; one open request at a time', async () => {
    const b = buyer();
    expect(await submitRequest(b, { ...ask, product: 'nope' })).toMatchObject({ ok: false, status: 404 });
    const unprepared = product({ latestVersionId: null });
    expect(await submitRequest(b, { ...ask, product: unprepared.slug })).toMatchObject({ ok: false, error: expect.stringMatching(/being prepared/) });
    const p = product();
    expect(await submitRequest(p.sellerId, { ...ask, product: p.slug })).toMatchObject({ ok: false });
    expect(await submitRequest(b, { ...ask, package: 'custom', product: p.slug })).toMatchObject({ ok: false }); // not offered
    const r = await submitRequest(b, { ...ask, product: p.slug });
    expect(r.ok && r.value).toMatchObject({ status: 'submitted', licenceTier: 'single_project', package: 'setup' });
    expect(await submitRequest(b, { ...ask, product: p.slug })).toMatchObject({ ok: false, status: 409 });
  });
});

describe('quotation at the listed price, accepted into an order', () => {
  it('no Super approval needed; issued for 7 days; acceptance creates the order from the quotation only, once', async () => {
    const now = Date.UTC(2026, 10, 2, 10);
    const { b, req, quote, p } = await quoted([
      { label: 'Bakery site', cents: 4900, kind: 'product' },
      { label: 'Setup help', cents: 3000, kind: 'package' },
      { label: 'Domain mybakery.com (1 year)', cents: 1200, kind: 'domain', passThroughVerified: true },
    ]);
    expect(quote).toMatchObject({ priceOverride: false, totalCents: 9100, sellerGrossCents: 7900, feeCents: 1185, passThroughCents: 1200, commissionBps: 1500 });
    const issued = await issueQuote('admin-1', quote.id, now);
    expect(issued.ok && issued.value).toMatchObject({ status: 'issued', validUntil: now + 7 * DAY_MS });
    expect((await getRequest(req.id))!.status).toBe('quoted');
    expect(await acceptQuote('someone-else', quote.id, now + DAY_MS)).toMatchObject({ ok: false, status: 404 });
    const a = await acceptQuote(b, quote.id, now + DAY_MS);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const again = await acceptQuote(b, quote.id, now + DAY_MS + 1000);
    expect(again.ok && again.value.orderId).toBe(a.value.orderId); // idempotent
    const o = (await getOrder(a.value.orderId))!;
    expect(o).toMatchObject({
      state: 'awaiting_payment',
      priceCents: 9100,
      feeCents: 1185,
      sellerGrossCents: 7900,
      quotationId: quote.id,
      sellerId: p.sellerId,
      buyerId: b,
      demo: false,
      instant: false,
      licence: 'single_project',
      supportDays: 30,
      updateDays: 90,
      fileVersionId: p.latestVersionId,
    });
    // the ledger splits on the seller gross: seller keeps 6715, SellOnBay 1185 + the 1200 pass-through
    expect(split(o.lines, o.feeCents, o.sellerGrossCents)).toEqual({ total: 9100, sellerNet: 6715, platform: 2385 });
    expect((await getRequest(req.id))!.status).toBe('converted');
    expect((await quoteEvents(quote.id)).map((e) => e.event)).toEqual(['drafted', 'issued', 'accepted']);
    expect((await requestEvents(req.id)).map((e) => e.event)).toEqual(['submitted', 'review', 'quoted', 'converted']);
  });
  it('an expired quotation cannot be accepted, and the scheduled job marks it expired', async () => {
    const now = Date.UTC(2026, 10, 3);
    const { b, quote, req } = await quoted([
      { label: 'Bakery site', cents: 4900, kind: 'product' },
      { label: 'Setup help', cents: 3000, kind: 'package' },
    ]);
    await issueQuote('admin-1', quote.id, now);
    expect(await acceptQuote(b, quote.id, now + 7 * DAY_MS)).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
    await expireDue(now + 7 * DAY_MS + 1);
    expect((await getQuote(quote.id))!.status).toBe('expired');
    expect((await getRequest(req.id))!.status).toBe('under_review');
  });
});

describe('any price change needs Super Admin approval (O-8)', () => {
  it('a discount goes to Super first; it reaches the buyer only after approval, which is audited', async () => {
    const { b, quote } = await quoted([
      { label: 'Bakery site', cents: 4000, kind: 'product' },
      { label: 'Setup help', cents: 3000, kind: 'package' },
    ]);
    expect(quote.priceOverride).toBe(true);
    const sent = await issueQuote('admin-1', quote.id);
    expect(sent.ok && sent.value.status).toBe('pending_super');
    expect(await acceptQuote(b, quote.id)).toMatchObject({ ok: false });
    expect(await superDecision('super-1', quote.id, 'approve', 'no')).toMatchObject({ ok: false, status: 400 });
    const ok = await superDecision('super-1', quote.id, 'approve', 'Loyal returning customer.');
    expect(ok.ok && ok.value).toMatchObject({ status: 'issued', overrideApprovedBy: 'super-1' });
    expect((await auditList(300)).some((e) => e.action === 'quotation_override_approve' && e.targetRef === quote.id)).toBe(true);
    expect((await acceptQuote(b, quote.id)).ok).toBe(true);
  });
  it('an increase needs approval too, and a draft with a different price needs a written reason', async () => {
    const p = product();
    const b = buyer();
    const r = await submitRequest(b, { ...ask, product: p.slug });
    if (!r.ok) throw new Error(r.error);
    await adminRequestAction('admin-1', r.value.id, 'review', {});
    const lines = [
      { label: 'Bakery site', cents: 9900, kind: 'product' },
      { label: 'Setup help', cents: 3000, kind: 'package' },
    ];
    expect(await draftQuote('admin-1', r.value.id, { lines, terms })).toMatchObject({ ok: false, error: expect.stringMatching(/Super Admin/) });
    const d = await draftQuote('admin-1', r.value.id, { lines, terms, overrideReason: 'Extra pages agreed.' });
    expect(d.ok && d.value.priceOverride).toBe(true);
  });
  it('a declined override goes back to draft; withdrawing an issued quotation sends the request back to review', async () => {
    const { b, quote, req } = await quoted([
      { label: 'Bakery site', cents: 1000, kind: 'product' },
      { label: 'Setup help', cents: 3000, kind: 'package' },
    ]);
    await issueQuote('admin-1', quote.id);
    const back = await superDecision('super-1', quote.id, 'decline', 'Too large a discount.');
    expect(back.ok && back.value.status).toBe('draft');
    expect(await rejectQuote(b, quote.id, 'too high')).toMatchObject({ ok: false });
    const w = await withdrawQuote('admin-1', quote.id, 'Writing a new version.');
    expect(w.ok && w.value.status).toBe('discarded');
    expect((await getRequest(req.id))!.status).toBe('under_review');
  });
});

describe('admin and buyer steps on a request', () => {
  it('asking a question needs a reason; the buyer answers; decline needs a reason; only the buyer can withdraw', async () => {
    const p = product();
    const b = buyer();
    const r = await submitRequest(b, { ...ask, product: p.slug });
    if (!r.ok) throw new Error(r.error);
    await adminRequestAction('admin-1', r.value.id, 'review', {});
    expect(await adminRequestAction('admin-1', r.value.id, 'ask', { note: '' })).toMatchObject({ ok: false });
    expect((await adminRequestAction('admin-1', r.value.id, 'ask', { note: 'Which languages do you need?' })).ok).toBe(true);
    expect(await buyerRequestAction('other', r.value.id, 'answer', 'Bengali')).toMatchObject({ ok: false, status: 404 });
    expect((await buyerRequestAction(b, r.value.id, 'answer', 'Bengali and English')).ok).toBe(true);
    expect((await getRequest(r.value.id))!.status).toBe('under_review');
    expect((await buyerRequestAction(b, r.value.id, 'withdraw')).ok).toBe(true);
    expect(await adminRequestAction('admin-1', r.value.id, 'review', {})).toMatchObject({ ok: false, status: 409 });
  });
  it('an admin-set expiry closes a request that waits too long', async () => {
    const p = product();
    const b = buyer();
    const now = Date.UTC(2026, 10, 5);
    const r = await submitRequest(b, { ...ask, product: p.slug }, now);
    if (!r.ok) throw new Error(r.error);
    await adminRequestAction('admin-1', r.value.id, 'set_expiry', { expiresInDays: 3 }, now);
    await expireDue(now + 3 * DAY_MS + 1);
    expect((await getRequest(r.value.id))!.status).toBe('expired');
  });
});

describe('custom development (R-10): buyer-confirmed written requirements before any quotation', () => {
  it('cannot be quoted until the buyer confirms the requirement set; then needs Super approval (no listed price)', async () => {
    const b = buyer();
    const brief = 'A booking system with staff calendars, SMS reminders and a small admin page for opening hours.';
    const r = await submitRequest(b, { ...ask, package: 'asis', requirements: brief, kind: 'custom_dev' });
    if (!r.ok) throw new Error(r.error);
    await adminRequestAction('admin-1', r.value.id, 'review', {});
    const lines = [{ label: 'Booking system build', cents: 120_000, kind: 'custom' }];
    expect(await draftQuote('admin-1', r.value.id, { lines, terms, overrideReason: 'Custom job.' })).toMatchObject({ ok: false, error: expect.stringMatching(/confirm/) });
    expect(await buyerRequestAction(b, r.value.id, 'confirm_requirements')).toMatchObject({ ok: false }); // nothing written yet
    const reqs = 'Staff calendars with 15-minute slots; SMS reminders 24 hours before; admin page to set opening hours; English and Bengali.';
    expect((await adminRequestAction('admin-1', r.value.id, 'propose_requirements', { requirements: reqs })).ok).toBe(true);
    expect((await buyerRequestAction(b, r.value.id, 'confirm_requirements')).ok).toBe(true);
    const d = await draftQuote('admin-1', r.value.id, { lines, terms, overrideReason: 'Custom job, no listed price.' });
    expect(d.ok && d.value).toMatchObject({ priceOverride: true, ownerType: 'platform', feeCents: 120_000 });
  });
});
