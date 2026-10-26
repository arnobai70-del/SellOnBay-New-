import { describe, expect, it } from 'vitest';
import { CONFIG, HOUR_MS } from '@/lib/config';
import { MAX_HOURS, daysFor, deliveryChoices, deliveryText, deliveryValue, expressHelps, parseHourChoices, promiseHours, readDelivery } from '@/lib/deliveryTime';
import { transition, type Order } from '@/lib/orders/machine';
import { checkProductEdit, type ProductEditInput } from '@/lib/productEditRules';
import { DEFAULTS, allowedHours, forgetSettings, getSettings, problemWith, setSettings } from '@/lib/settings';
import { TEMPLATES } from '@/emails/templates';

describe('delivery in hours', () => {
  it('has its choices in the config, inside one to seven days', () => {
    expect(CONFIG.deliveryHours).toEqual({ choices: [6, 12, 18, 36], minHours: 1, maxChoices: 8 });
    expect(MAX_HOURS).toBe(CONFIG.delivery.maxDays * 24);
    for (const h of CONFIG.deliveryHours.choices) expect(h).toBeLessThanOrEqual(MAX_HOURS);
  });

  it('hours win over days, and the days that cover them are kept for older screens', () => {
    expect(promiseHours({ days: 3 })).toBe(72);
    expect(promiseHours({ days: 3, hours: 12 })).toBe(12);
    expect(daysFor(6)).toBe(1);
    expect(daysFor(36)).toBe(2);
    expect(daysFor(MAX_HOURS)).toBe(CONFIG.delivery.maxDays);
    expect(deliveryText({ days: 1, hours: 12 })).toBe('12 hours');
    expect(deliveryText({ days: 1, hours: 1 })).toBe('1 hour');
    expect(deliveryText({ days: 1 })).toBe('1 day');
    expect(deliveryText({ days: 4, hours: null })).toBe('4 days');
    expect(deliveryValue({ days: 1, hours: 12 })).toBe('12h');
    expect(deliveryValue({ days: 3 })).toBe('3');
  });

  it('reads the form: an allowed hour, or days as before', () => {
    expect(readDelivery('12h', [6, 12])).toEqual({ ok: true, days: 1, hours: 12 });
    expect(readDelivery('36h', [36])).toEqual({ ok: true, days: 2, hours: 36 });
    expect(readDelivery('8h', [6, 12])).toMatchObject({ ok: false });
    expect(readDelivery('12h', [])).toMatchObject({ ok: false }); // hours turned off
    expect(readDelivery('8h', [6, 12], 8)).toEqual({ ok: true, days: 1, hours: 8 }); // a listing keeps hours no longer offered
    expect(readDelivery('999h', [999], 999)).toMatchObject({ ok: false });
    expect(readDelivery('5', [6])).toEqual({ ok: true, days: 5, hours: null });
    expect(readDelivery('1 to 2 days', [])).toEqual({ ok: true, days: 2, hours: null });
    expect(readDelivery('99', [])).toEqual({ ok: true, days: CONFIG.delivery.maxDays, hours: null });
    expect(readDelivery('', [])).toEqual({ ok: true, days: 3, hours: null });
  });

  it('lists the hour choices before the days, and keeps a listing’s own hours', () => {
    const c = deliveryChoices([12, 6]);
    expect(c.slice(0, 2)).toEqual([
      ['6h', '6 hours'],
      ['12h', '12 hours'],
    ]);
    expect(c).toHaveLength(2 + CONFIG.delivery.maxDays);
    expect(deliveryChoices([6], 8).map(([v]) => v)).toContain('8h');
    expect(deliveryChoices([]).every(([v]) => !v.endsWith('h'))).toBe(true);
  });

  it('express is dropped only on a listing promised in hours within the express time', () => {
    expect(expressHelps({ days: 2 })).toBe(true);
    expect(expressHelps({ days: 1 })).toBe(true); // days behave as before
    expect(expressHelps({ days: 1, hours: 24 })).toBe(false);
    expect(expressHelps({ days: 1, hours: 12 })).toBe(false);
    expect(expressHelps({ days: 2, hours: 36 })).toBe(true);
  });
});

describe('the admin setting', () => {
  it('is a cleaned list of whole hours within the limits', () => {
    expect(parseHourChoices('36, 6,12 12')).toEqual({ ok: true, hours: [6, 12, 36] });
    expect(parseHourChoices('')).toEqual({ ok: true, hours: [] });
    expect(parseHourChoices('0')).toMatchObject({ ok: false });
    expect(parseHourChoices('2.5')).toMatchObject({ ok: false });
    expect(parseHourChoices(String(MAX_HOURS + 1))).toMatchObject({ ok: false });
    expect(parseHourChoices('1,2,3,4,5,6,7,8,9')).toMatchObject({ ok: false });
  });
  it('is on with the config choices by default, and off means whole days only', () => {
    expect(problemWith(DEFAULTS)).toBeNull();
    expect(allowedHours(DEFAULTS)).toEqual(CONFIG.deliveryHours.choices);
    expect(allowedHours({ ...DEFAULTS, deliveryHoursOn: false })).toEqual([]);
    expect(problemWith({ ...DEFAULTS, deliveryHourChoices: 'soon' })).toMatch(/whole number/);
    expect(problemWith({ ...DEFAULTS, deliveryHourChoices: '' })).toMatch(/at least one/);
    expect(problemWith({ ...DEFAULTS, deliveryHoursOn: false, deliveryHourChoices: '' })).toBeNull();
  });
  it('an admin saves them cleaned and audited, and can turn them off', async () => {
    expect((await setSettings('admin-1', { deliveryHourChoices: '36,6' }, 'Fewer hour choices for now.')).ok).toBe(true);
    expect((await getSettings()).deliveryHourChoices).toBe('6, 36');
    expect((await setSettings('admin-1', { deliveryHoursOn: false }, 'Days only while we start.')).ok).toBe(true);
    expect(allowedHours(await getSettings())).toEqual([]);
    expect((await setSettings('admin-1', { deliveryHoursOn: true, deliveryHourChoices: '0' }, 'A bad choice.')).ok).toBe(false);
    await setSettings('admin-1', { deliveryHoursOn: DEFAULTS.deliveryHoursOn, deliveryHourChoices: DEFAULTS.deliveryHourChoices }, 'Reset after a test.');
    forgetSettings();
  });
});

describe('the order timer', () => {
  const o: Order = {
    id: 'o1',
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'live_site',
    state: 'awaiting_payment',
    title: 't',
    buyerId: 'b',
    sellerId: 's',
    productId: null,
    productKey: 'p',
    devKey: null,
    lines: [['Site', 3000]],
    priceCents: 3000,
    feeCents: 900,
    refundedCents: 0,
    currency: 'USD',
    days: 1,
    hours: 12,
    express: false,
    instant: false,
    demo: true,
    attempts: 0,
    createdAt: 0,
  };
  it('runs for the promised hours from the payment', () => {
    expect(transition(o, 'funded', { now: 1000 }).order.dueAt).toBe(1000 + 12 * HOUR_MS);
    expect(transition({ ...o, hours: undefined, days: 2 }, 'funded', { now: 1000 }).order.dueAt).toBe(1000 + 48 * HOUR_MS);
  });
  it('the payment note says hours', () => {
    expect(TEMPLATES.order_funded({ title: 'Site', days: 1, hours: 12 }).text).toContain('due in 12 hours');
    expect(TEMPLATES.order_funded({ title: 'Site', days: 3 }).text).toContain('due in 3 days');
  });
});

describe('an admin edits a listing’s hours', () => {
  const ctx = { platform: 'web', priceMinCents: 500, priceMaxCents: 7000, hasHostedDemo: false };
  const ok: ProductEditInput = {
    name: 'Saffron Table',
    category: 'Restaurants',
    desc: 'A clean restaurant site with a menu, booking form and gallery.',
    includes: 'Menu page\nBooking form\nGallery',
    price: 39,
    days: 3,
    demo: 'https://demo.example.com',
    sample: '',
    docsUrl: '',
    requirements: '',
    express: '15',
    setupPrice: 30,
    customPrice: 0,
    supportDays: 0,
    updateDays: 0,
  };
  it('any whole hour within the limit, with the days worked out and express dropped when it no longer helps', () => {
    const c = checkProductEdit({ ...ok, hours: 8 }, ctx);
    expect(c.ok && c.row).toMatchObject({ delivery_hours: 8, delivery_days: 1, express_price_cents: null });
    const d = checkProductEdit({ ...ok, hours: 36 }, ctx);
    expect(d.ok && d.row).toMatchObject({ delivery_hours: 36, delivery_days: 2, express_price_cents: 1500 });
    expect(checkProductEdit({ ...ok, hours: 0 }, ctx)).toMatchObject({ ok: false });
    expect(checkProductEdit({ ...ok, hours: MAX_HOURS + 1 }, ctx)).toMatchObject({ ok: false });
  });
  it('null goes back to days; not sent leaves the column alone', () => {
    const c = checkProductEdit({ ...ok, hours: null }, ctx);
    expect(c.ok && c.row).toMatchObject({ delivery_hours: null, delivery_days: 3 });
    const n = checkProductEdit(ok, ctx);
    expect(n.ok && 'delivery_hours' in n.row).toBe(false);
  });
});
