import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { notificationsFor } from '@/lib/notify';
import { daysUntil, domainReminders, reminderStep } from '@/lib/orders/domains';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { createOrder } from '@/lib/orders/service';

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe('which reminder applies', () => {
  it('the smallest step that already applies, and none when it is far off or already over', () => {
    expect(reminderStep(100)).toBeNull();
    expect(reminderStep(30)).toBe(30);
    expect(reminderStep(29)).toBe(30);
    expect(reminderStep(8)).toBe(30);
    expect(reminderStep(7)).toBe(7);
    expect(reminderStep(5)).toBe(7);
    expect(reminderStep(1)).toBe(1);
    expect(reminderStep(0)).toBe(1);
    expect(reminderStep(-1)).toBeNull();
  });
  it('counts calendar days to the expiry date: tomorrow is 1, today is 0, yesterday is -1', () => {
    const now = Date.UTC(2026, 9, 8, 10);
    expect(daysUntil('2026-10-09', now)).toBe(1);
    expect(daysUntil('2026-10-08', now)).toBe(0);
    expect(daysUntil('2026-10-15', now)).toBe(7);
    expect(daysUntil('2026-10-07', now)).toBe(-1);
  });
});

let n = 0;
const bought = async (expires: string, source: 'new' | 'own' = 'new') => {
  const k = ++n;
  const o = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'live_site',
    title: 'Site',
    lines: [['Site', 5000]],
    days: 1,
    buyerId: `dm-b${k}`,
    sellerId: `dm-s${k}`,
    domain: { name: `shop${k}.com`, source, expires, ref: 'dom_test' }, // already registered, so the fake registrar does not set its own date
    demo: false,
  });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  return { o, buyer: `dm-b${k}` };
};
const count = async (u: string) => (await notificationsFor(u)).filter((x) => x.kind === 'domain_expiring').length;

describe('domain renewal reminders', () => {
  it('tells the buyer 30, 7 and 1 days before, once each, however often the job runs', async () => {
    const { buyer } = await bought(day(Date.now() + 40 * DAY_MS));
    const base = Date.now();
    await domainReminders(base);
    expect(await count(buyer)).toBe(0); // 40 days: too early
    await domainReminders(base + 11 * DAY_MS); // 29 days left
    await domainReminders(base + 12 * DAY_MS);
    expect(await count(buyer)).toBe(1);
    await domainReminders(base + 34 * DAY_MS); // 6 days left
    expect(await count(buyer)).toBe(2);
    await domainReminders(base + 39 * DAY_MS); // 1 day left
    await domainReminders(base + 39 * DAY_MS + 3600_000);
    expect(await count(buyer)).toBe(3);
    await domainReminders(base + 50 * DAY_MS); // already expired: nothing more
    expect(await count(buyer)).toBe(3);
  });
  it('a domain the buyer already owned is not ours to renew, so no reminder', async () => {
    const { buyer } = await bought(day(Date.now() + 3 * DAY_MS), 'own');
    await domainReminders();
    expect(await count(buyer)).toBe(0);
  });
});
