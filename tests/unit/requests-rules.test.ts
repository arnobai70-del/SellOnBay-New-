import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { PLANS_V1 } from '@/lib/plans/rules';
import { acceptProblem, checkLines, checkRequest, checkTerms, listedLines, mayMoveQuote, mayMoveRequest, needsSuperApproval, quoteMoney, validUntil } from '@/lib/requests/rules';

const base = { licenceTier: 'single_project', package: 'asis', intendedUse: 'A website for my bakery in Dhaka.', consent: true };

describe('purchase request input', () => {
  it('a buyer must confirm how requests work, choose a licence and say how they will use it', () => {
    expect(checkRequest({ ...base, consent: false })).toMatchObject({ ok: false });
    expect(checkRequest({ ...base, licenceTier: 'full_transfer' })).toMatchObject({ ok: false }); // exclusivity is never a tier
    expect(checkRequest({ ...base, intendedUse: 'site' })).toMatchObject({ ok: false });
    const ok = checkRequest({ ...base, requirements: 'Bengali and English.', express: true, delivery: { domain: 'https://MyBakery.com/home', github: '@octocat', oses: ['Linux', 'Hacker'] } });
    expect(ok.ok && ok.value).toMatchObject({
      licenceTier: 'single_project',
      package: 'asis',
      extras: { express: true, hosting: false },
      delivery: { domain: 'mybakery.com', github: 'octocat', oses: ['Linux'] },
    });
  });
  it('exclusive ownership can only be asked about, never chosen as a tier', () => {
    expect(checkRequest({ ...base, licenceTier: 'exclusive_review' }).ok).toBe(true);
  });
  it('refuses contact details and markup (communication is admin-mediated)', () => {
    expect(checkRequest({ ...base, intendedUse: 'Email me at buyer@example.com please' })).toMatchObject({ ok: false });
    expect(checkRequest({ ...base, requirements: 'Call +880 1711 223344 anytime' })).toMatchObject({ ok: false });
    expect(checkRequest({ ...base, requirements: 'ping me on wa.me/123' })).toMatchObject({ ok: false });
    expect(checkRequest({ ...base, intendedUse: '<script>alert(1)</script> my shop' })).toMatchObject({ ok: false });
    expect(checkRequest({ ...base, delivery: { domain: 'not a domain' } })).toMatchObject({ ok: false });
  });
  it('custom development needs a real description of the work', () => {
    expect(checkRequest({ ...base, requirements: 'short' }, 'custom_dev')).toMatchObject({ ok: false });
    expect(checkRequest({ ...base, requirements: 'A booking system with staff calendars, SMS reminders and a small admin page for opening hours.' }, 'custom_dev').ok).toBe(true);
  });
});

describe('state machines', () => {
  it('requests only move along the listed paths; finished ones never move again', () => {
    expect(mayMoveRequest('submitted', 'under_review')).toBe(true);
    expect(mayMoveRequest('submitted', 'quoted')).toBe(false); // an admin reviews first
    expect(mayMoveRequest('quoted', 'converted')).toBe(true);
    for (const done of ['converted', 'declined', 'withdrawn', 'expired'] as const) expect(mayMoveRequest(done, 'under_review')).toBe(false);
  });
  it('quotations: draft -> (Super) -> issued -> accepted; an issued one is never edited, only replaced', () => {
    expect(mayMoveQuote('draft', 'issued')).toBe(true);
    expect(mayMoveQuote('pending_super', 'issued')).toBe(true);
    expect(mayMoveQuote('issued', 'draft')).toBe(false);
    expect(mayMoveQuote('issued', 'superseded')).toBe(true);
    expect(mayMoveQuote('accepted', 'withdrawn')).toBe(false);
  });
  it('an issued quotation is valid for 7 days', () => {
    expect(validUntil(1000)).toBe(1000 + 7 * DAY_MS);
  });
});

describe('quotation prices (O-8: every difference from the listed price needs Super Admin)', () => {
  const listing = { name: 'Bakery site', priceCents: 4900, setupCents: 3000, customCents: 10_000, expressCents: 1500, expressHelps: true };
  it('listed lines follow the listing: product, package, express when it helps, hosting', () => {
    expect(listedLines(listing, 'setup', { express: true, hosting: false }).map((l) => [l.kind, l.cents])).toEqual([
      ['product', 4900],
      ['package', 3000],
      ['express', 1500],
    ]);
    expect(listedLines({ ...listing, expressHelps: false }, 'asis', { express: true, hosting: false })).toHaveLength(1);
  });
  it('the same amount needs no approval; any increase or discount does; no listed price always does', () => {
    const listed = listedLines(listing, 'asis', { express: false, hosting: false });
    expect(needsSuperApproval([{ label: 'Bakery site', cents: 4900, kind: 'product' }], listed)).toBe(false);
    expect(needsSuperApproval([{ label: 'Bakery site', cents: 4500, kind: 'product' }], listed)).toBe(true);
    expect(needsSuperApproval([{ label: 'Bakery site', cents: 5900, kind: 'product' }], listed)).toBe(true);
    expect(needsSuperApproval([{ label: 'x', cents: 4900, kind: 'product' }], null)).toBe(true);
    // a verified pass-through domain line is a cost, not a price change
    expect(
      needsSuperApproval(
        [
          { label: 'Bakery site', cents: 4900, kind: 'product' },
          { label: 'Domain', cents: 1200, kind: 'domain', passThroughVerified: true },
        ],
        listed,
      ),
    ).toBe(false);
  });
  it('admin lines are checked: kinds, whole cents, a positive total', () => {
    expect(checkLines([])).toMatchObject({ ok: false });
    expect(checkLines([{ label: 'Site', cents: 49.5, kind: 'product' }])).toMatchObject({ ok: false });
    expect(checkLines([{ label: 'Site', cents: 4900, kind: 'free-money' }])).toMatchObject({ ok: false });
    expect(checkLines([{ label: 'Site', cents: 0, kind: 'product' }])).toMatchObject({ ok: false });
    const ok = checkLines([
      { label: 'Site', cents: 4900, kind: 'product' },
      { label: 'Domain', cents: 1200, kind: 'domain', passThroughVerified: true },
    ]);
    expect(ok.ok && ok.lines[1].passThroughVerified).toBe(true);
  });
  it('money follows the seller plan at quotation time', () => {
    const lines = [{ label: 'Site', cents: 10_000, kind: 'product' as const }];
    expect(quoteMoney(lines, PLANS_V1.pro, 'seller')).toMatchObject({ feeCents: 1000, sellerNetCents: 9000 });
    expect(quoteMoney(lines, PLANS_V1.pro, 'platform')).toMatchObject({ feeCents: 10_000, sellerNetCents: 0 });
  });
});

describe('quotation terms and acceptance', () => {
  it('terms are complete and checked; exclusive rights need a recorded legal/IP review', () => {
    expect(checkTerms({ deliveryDays: 0 }, 'single_project')).toMatchObject({ ok: false });
    expect(checkTerms({ deliveryDays: 3, revisions: { included: 2, windowDays: 14, scope: '' } }, 'single_project')).toMatchObject({ ok: false });
    const t = checkTerms({ deliveryDays: 3, supportDays: 30, revisions: { included: 2, windowDays: 14, scope: 'Text and colour changes', extraPriceCents: 1500 } }, 'multi_project');
    expect(t.ok && t.terms).toMatchObject({ licenceTier: 'multi_project', revisions: { included: 2, extraPriceCents: 1500 }, licenceTextVersion: expect.any(String) });
    expect(checkTerms({ deliveryDays: 3 }, 'exclusive_review')).toMatchObject({ ok: false });
    expect(checkTerms({ deliveryDays: 3, legalReview: 'Checked by counsel: 2 earlier single-project buyers keep their rights.' }, 'exclusive_review').ok).toBe(true);
  });
  it('only the buyer can accept, only an issued and unexpired quotation; accepting again is allowed (same order)', () => {
    const q = { status: 'issued' as const, validUntil: 2000, buyerId: 'b1' };
    expect(acceptProblem(q, 'b2', 1000)).toMatch(/not yours/);
    expect(acceptProblem(q, 'b1', 2000)).toMatch(/expired/);
    expect(acceptProblem(q, 'b1', 1000)).toBeNull();
    expect(acceptProblem({ ...q, status: 'withdrawn' }, 'b1', 1000)).toMatch(/no longer/);
    expect(acceptProblem({ ...q, status: 'accepted' }, 'b1', 5000)).toBeNull();
  });
});
