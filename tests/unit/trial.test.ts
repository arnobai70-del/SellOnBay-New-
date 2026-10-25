import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { DEVS, creditsTrial, parseTrialInput, trialOf, type Pack } from '@/lib/developers';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, cancel, createOrder, deliver, getOrder } from '@/lib/orders/service';
import { findTrialCredit } from '@/lib/orders/trial';

const packs = (basic: number): Pack[] => [
  { name: 'Basic', price: basic, days: 3, blurb: 'b', features: ['x'] },
  { name: 'Standard', price: basic * 2, days: 5, blurb: 'b', features: ['x'] },
  { name: 'Premium', price: basic * 3, days: 7, blurb: 'b', features: ['x'] },
];

describe('trial package rules', () => {
  it('a trial costs at most $150 and lasts 3 to 5 days, whatever the Basic price is', () => {
    for (const basic of [10, 40, 100, 400, 1000, 2000]) {
      const t = trialOf({ packs: packs(basic) });
      expect(t.price).toBeLessThanOrEqual(150);
      expect(t.price).toBeGreaterThanOrEqual(15);
      expect(t.days).toBeGreaterThanOrEqual(3);
      expect(t.days).toBeLessThanOrEqual(5);
    }
    expect(trialOf({ packs: packs(2000) }).price).toBe(150);
    expect(trialOf({ packs: packs(100) }).price).toBe(35);
  });
  it('every starter developer has a valid trial, and some of them credit it', () => {
    for (const d of DEVS) expect(trialOf(d).price).toBeLessThanOrEqual(150);
    expect(DEVS.some((d) => creditsTrial(d))).toBe(true);
    expect(DEVS.some((d) => !creditsTrial(d))).toBe(true);
    expect(creditsTrial({ id: 'someone-new', creditTrial: true })).toBe(true);
    expect(creditsTrial({ id: 'aisha-rahman', creditTrial: false })).toBe(false);
  });
});

let n = 0;
/* A finished trial: funded, delivered, accepted. */
const finishedTrial = async (buyerId: string, devKey: string, priceCents = 3_500) => {
  const o = await createOrder({
    kind: 'trial',
    pkg: 'custom',
    deliveryType: 'download',
    title: 'Trial',
    lines: [['Trial package', priceCents]],
    days: 3,
    buyerId,
    sellerId: null,
    devKey,
    demo: false,
  });
  await handlePaymentEvent('verified-test-psp', { id: `evt_t${++n}`, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  await deliver(o.id, null);
  await accept(o.id, buyerId);
  return (await getOrder(o.id))!;
};
const custom = (buyerId: string, devKey: string, trialCreditFor?: string) =>
  createOrder({ kind: 'custom', pkg: 'custom', deliveryType: 'download', title: 'Project', lines: [['Basic package', 20_000]], days: 5, buyerId, sellerId: null, devKey, trialCreditFor, demo: false });

describe('trial credit toward a full job', () => {
  it('a finished trial with the same developer within 30 days gives its price back as credit', async () => {
    const t = await finishedTrial('buyer-1', 'dev-a');
    expect(await findTrialCredit('buyer-1', 'dev-a', 20_000, t.acceptedAt! + 29 * DAY_MS)).toEqual({ trialId: t.id, creditCents: 3_500 });
  });
  it('not after 30 days, not for another buyer, not for another developer, not signed out', async () => {
    const t = await finishedTrial('buyer-2', 'dev-b');
    expect(await findTrialCredit('buyer-2', 'dev-b', 20_000, t.acceptedAt! + 31 * DAY_MS)).toBeNull();
    expect(await findTrialCredit('buyer-other', 'dev-b', 20_000, t.acceptedAt! + DAY_MS)).toBeNull();
    expect(await findTrialCredit('buyer-2', 'dev-other', 20_000, t.acceptedAt! + DAY_MS)).toBeNull();
    expect(await findTrialCredit(null, 'dev-b', 20_000, t.acceptedAt! + DAY_MS)).toBeNull();
  });
  it('only an accepted trial counts, not one that is funded or only delivered', async () => {
    const o = await createOrder({
      kind: 'trial',
      pkg: 'custom',
      deliveryType: 'download',
      title: 'Trial',
      lines: [['Trial', 3_000]],
      days: 3,
      buyerId: 'buyer-3',
      sellerId: null,
      devKey: 'dev-c',
      demo: false,
    });
    await handlePaymentEvent('verified-test-psp', { id: `evt_t${++n}`, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
    expect(await findTrialCredit('buyer-3', 'dev-c', 20_000)).toBeNull();
    await deliver(o.id, null);
    expect(await findTrialCredit('buyer-3', 'dev-c', 20_000)).toBeNull();
  });
  it('each trial is credited once; if that order is cancelled the credit is free again', async () => {
    const t = await finishedTrial('buyer-4', 'dev-d');
    const credit = (await findTrialCredit('buyer-4', 'dev-d', 20_000))!;
    const first = await custom('buyer-4', 'dev-d', credit.trialId);
    expect(await findTrialCredit('buyer-4', 'dev-d', 20_000)).toBeNull();
    await cancel(first.id, 'buyer-4', 'changed my mind');
    expect(await findTrialCredit('buyer-4', 'dev-d', 20_000)).toEqual({ trialId: t.id, creditCents: 3_500 });
  });
  it('the credit never takes the new price below the smallest order ($5)', async () => {
    await finishedTrial('buyer-5', 'dev-e', 15_000);
    const c = await findTrialCredit('buyer-5', 'dev-e', 10_000);
    expect(c?.creditCents).toBe(10_000 - 500);
    expect(await findTrialCredit('buyer-5', 'dev-e', 500)).toBeNull(); // nothing left to credit
  });
});

describe("a developer's own trial package", () => {
  it('uses their price and days, inside the limits; blank means we work it out', () => {
    expect(trialOf({ packs: packs(100), trial: { price: 60, days: 5 } })).toMatchObject({ name: 'Trial', price: 60, days: 5 });
    expect(trialOf({ packs: packs(100) })).toMatchObject({ price: 35, days: 3 });
    // even if a saved value were out of range, an order can never be more than $150 or outside 3 to 5 days
    expect(trialOf({ packs: packs(100), trial: { price: 900, days: 30 } })).toMatchObject({ price: 150, days: 5 });
    expect(trialOf({ packs: packs(100), trial: { price: 40, days: 1 } }).days).toBe(3);
  });
  it('the form input: both blank is fine, otherwise a whole price from $5 to $150 and 3 to 5 days', () => {
    expect(parseTrialInput('', '')).toEqual({ ok: true, trial: null });
    expect(parseTrialInput(undefined, undefined)).toEqual({ ok: true, trial: null });
    expect(parseTrialInput('45', '4')).toEqual({ ok: true, trial: { price: 45, days: 4 } });
    expect(parseTrialInput(150, 5)).toEqual({ ok: true, trial: { price: 150, days: 5 } });
    for (const [p, d] of [
      ['151', '3'],
      ['4', '3'],
      ['45.5', '3'],
      ['abc', '3'],
      ['45', '2'],
      ['45', '6'],
      ['45', ''],
      ['', '4'],
    ] as const)
      expect(parseTrialInput(p, d).ok, `${p} ${d}`).toBe(false);
  });
});
