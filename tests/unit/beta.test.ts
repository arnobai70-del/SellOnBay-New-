import { describe, expect, it, vi } from 'vitest';
import { betaEligible, checkBetaInput, checkFeedback, feedbackDue } from '@/lib/beta/rules';
import { betaFeedbackOf, betaRequest, decideBeta, requestBeta, runBetaJobs, saveFeedback } from '@/lib/beta/service';
import { COUNTRIES } from '@/lib/countries';
import { TRANSITIONS, isFundedState } from '@/lib/orders/machine';
import { decideRelease, isFunded, releaseConfigFromEnv } from '@/lib/delivery/policy';
import { ledgerStore } from '@/lib/ledgerStore';
import { getOrder, orderEvents, runDueJobs } from '@/lib/orders/service';
import { fakeEmail } from '@/lib/providers/email';
import { setSettings } from '@/lib/settings';
import { notificationsFor } from '@/lib/notify';

const GOOD = { name: 'Test Buyer', email: 'buyer@test.sellonbay.dev', country: 'de', company: '', useFor: 'A site for my shop', domain: '' };
let n = 0;
const buyer = () => `buyer-${++n}`;
const DAY = 86_400_000;

describe('beta rules', () => {
  it('only listings marked for the beta can be requested', () => {
    expect(betaEligible({ ownerType: 'platform' })).toBe(true);
    expect(betaEligible({ ownerType: 'seller', betaFreeOk: true })).toBe(true);
    expect(betaEligible({ ownerType: 'seller', betaFreeOk: false })).toBe(false);
    expect(betaEligible({})).toBe(false);
  });
  it('checks what the buyer writes', () => {
    expect(checkBetaInput(GOOD)).toMatchObject({ ok: true, value: { country: 'DE' } });
    expect(checkBetaInput({ ...GOOD, name: ' ' }).ok).toBe(false);
    expect(checkBetaInput({ ...GOOD, email: 'nope' }).ok).toBe(false);
    expect(checkBetaInput({ ...GOOD, country: 'Germany' }).ok).toBe(false);
    expect(checkBetaInput({ ...GOOD, useFor: 'x' }).ok).toBe(false);
    expect(checkBetaInput({ ...GOOD, domain: 'not a domain' }).ok).toBe(false);
    expect(checkBetaInput({ ...GOOD, domain: 'YourBrand.com' })).toMatchObject({ ok: true, value: { domain: 'yourbrand.com' } });
    expect(checkFeedback({ rating: 6 }).ok).toBe(false);
    expect(checkFeedback({ rating: 5, worked: 'All of it', improve: '' }).ok).toBe(true);
  });
  it('asks for feedback 7 days after approval, once', () => {
    expect(feedbackDue({ decidedAt: 0, approved: true }, 6 * DAY)).toBe(false);
    expect(feedbackDue({ decidedAt: 0, approved: true }, 7 * DAY)).toBe(true);
    expect(feedbackDue({ decidedAt: 0, approved: false }, 8 * DAY)).toBe(false);
    expect(feedbackDue({ decidedAt: 0, approved: true, feedbackSentAt: 1 }, 8 * DAY)).toBe(false);
  });
  it('has the country list for the form', () => {
    expect(COUNTRIES.length).toBeGreaterThan(190);
    expect(COUNTRIES.find((c) => c.code === 'BD')?.name).toBe('Bangladesh');
    expect(COUNTRIES.find((c) => c.code === 'US')?.name).toBe('United States');
  });
  it('the three beta states are not money states, and an approved request can get its files', () => {
    expect(TRANSITIONS.beta_requested).toEqual(['beta_approved', 'beta_declined']);
    expect(TRANSITIONS.beta_approved).toEqual([]);
    expect(TRANSITIONS.beta_declined).toEqual([]);
    expect(isFundedState('beta_approved')).toBe(false);
    expect(isFunded('beta_approved')).toBe(true);
    expect(isFunded('beta_requested')).toBe(false);
    expect(isFunded('beta_declined')).toBe(false);
    expect(decideRelease({ status: 'beta_requested', fundedAtMs: 0, nowMs: 0, priceCents: 0 }, releaseConfigFromEnv({})).allowed).toBe(false);
  });
});

describe('a beta request (made-up example listing, no database)', () => {
  it('creates a $0 order with an event and no ledger row, and tells sales and the buyer', async () => {
    const b = buyer();
    fakeEmail.sent.length = 0;
    const r = await requestBeta(b, 'leadform', GOOD);
    if (!r.ok) throw new Error(r.error);
    expect(r.value).toMatchObject({ state: 'beta_requested', priceCents: 0, feeCents: 0, buyerId: b });
    expect(r.value.payment?.brand).toBe('beta_free');
    expect(r.value.fundedAt).toBeUndefined();
    expect((await orderEvents(r.value.id))[0]).toMatchObject({ event: 'beta_requested', to: 'beta_requested', meta: { amount: 0, method: 'beta_free' } });
    expect(await (await ledgerStore()).lines(`pay:${r.value.id}`)).toEqual([]);
    const sales = fakeEmail.sent.find((m) => m.to === 'sales@sellonbay.com');
    expect(sales?.subject).toContain('New beta request');
    expect(sales?.text).toContain('/admin/orders/beta');
    expect((await notificationsFor(b)).some((x) => x.kind === 'beta_requested')).toBe(true);
  });

  it('refuses a second request for the same website, and a bad form', async () => {
    const b = buyer();
    expect((await requestBeta(b, 'invoicer', GOOD)).ok).toBe(true);
    expect(await requestBeta(b, 'invoicer', GOOD)).toMatchObject({ ok: false, status: 409 });
    expect(await requestBeta(b, 'saffron', { ...GOOD, email: 'x' })).toMatchObject({ ok: false, status: 400 });
    expect(await requestBeta(b, 'no-such-listing', GOOD)).toMatchObject({ ok: false, status: 404 });
  });

  it('approval moves the order, tells the buyer, and the feedback email goes once, 7 days later', async () => {
    const b = buyer();
    const r = await requestBeta(b, 'quotebot', GOOD);
    if (!r.ok) throw new Error(r.error);
    const now = Date.now();
    expect(await saveFeedback(b, r.value.id, { rating: 5 })).toMatchObject({ ok: false, status: 409 });
    const d = await decideBeta('admin-1', r.value.id, 'approve', '', now);
    expect(d.ok && d.value.state).toBe('beta_approved');
    expect(await decideBeta('admin-1', r.value.id, 'approve', '', now)).toMatchObject({ ok: false, status: 409 });
    expect((await notificationsFor(b)).some((x) => x.kind === 'beta_approved')).toBe(true);

    await runBetaJobs(now + 6 * DAY);
    expect((await notificationsFor(b)).some((x) => x.kind === 'beta_feedback')).toBe(false);
    await runBetaJobs(now + 7 * DAY);
    await runBetaJobs(now + 8 * DAY);
    expect((await notificationsFor(b)).filter((x) => x.kind === 'beta_feedback')).toHaveLength(1);

    expect(await saveFeedback('someone-else', r.value.id, { rating: 5 })).toMatchObject({ ok: false, status: 404 });
    expect(await saveFeedback(b, r.value.id, { rating: 4, worked: 'Setup', improve: 'Docs' })).toMatchObject({ ok: true });
    expect(await betaFeedbackOf(r.value.id)).toMatchObject({ rating: 4, worked: 'Setup', improve: 'Docs' });
    expect(await saveFeedback(b, r.value.id, { rating: 1 })).toMatchObject({ ok: false, status: 409 });
  });

  it('a decline needs a reason, reaches the buyer, and can be asked again', async () => {
    const b = buyer();
    const r = await requestBeta(b, 'clinic-desk', GOOD);
    if (!r.ok) throw new Error(r.error);
    expect(await decideBeta('admin-1', r.value.id, 'decline', 'no')).toMatchObject({ ok: false, status: 400 });
    const d = await decideBeta('admin-1', r.value.id, 'decline', 'Not a fit for the beta yet.');
    expect(d.ok && d.value.state).toBe('beta_declined');
    expect((await betaRequest(r.value.id))?.declineReason).toBe('Not a fit for the beta yet.');
    expect((await notificationsFor(b)).some((x) => x.kind === 'beta_declined')).toBe(true);
    expect((await requestBeta(b, 'clinic-desk', GOOD)).ok).toBe(true);
  });

  it('a mail failure never loses the request, and the job sends it later', async () => {
    const b = buyer();
    const send = vi.spyOn(fakeEmail, 'send').mockRejectedValueOnce(new Error('down'));
    const r = await requestBeta(b, 'tutorly', GOOD);
    expect(r.ok).toBe(true);
    send.mockRestore();
    if (!r.ok) return;
    expect((await betaRequest(r.value.id))?.salesNotifiedAt).toBeUndefined();
    expect((await runBetaJobs()).sales).toBeGreaterThanOrEqual(1);
    expect((await betaRequest(r.value.id))?.salesNotifiedAt).toBeTruthy();
  });

  it('the jobs never touch a beta order, and it stays unfunded', async () => {
    const b = buyer();
    const r = await requestBeta(b, 'shopline', GOOD);
    if (!r.ok) throw new Error(r.error);
    await runDueJobs(Date.now() + 30 * DAY);
    const o = await getOrder(r.value.id);
    expect(o?.state).toBe('beta_requested');
    expect(o?.fundedAt).toBeUndefined();
  });

  it('closes when payments go live', async () => {
    expect((await setSettings('admin-1', { paymentsMode: 'live' }, 'Going live for a test.')).ok).toBe(true);
    expect(await requestBeta(buyer(), 'pawprint', GOOD)).toMatchObject({ ok: false, status: 409 });
    expect((await setSettings('admin-1', { paymentsMode: 'beta_free' }, 'Back to the beta.')).ok).toBe(true);
  });
});
