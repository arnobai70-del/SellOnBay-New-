import { afterEach, describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { CONFIG } from '@/lib/config';
import { holdReasonFor } from '@/lib/holdStore';
import { seenFirst } from '@/lib/guard';
import { createOrder } from '@/lib/orders/service';
import { DEFAULTS, barText, forgetSettings, getSettings, problemWith, setSettings } from '@/lib/settings';

afterEach(async () => {
  // put the standard values back so other tests are not affected
  await setSettings(
    'admin-1',
    {
      priceMinCents: DEFAULTS.priceMinCents,
      priceMaxCents: DEFAULTS.priceMaxCents,
      holdNewBuyerMinCents: DEFAULTS.holdNewBuyerMinCents,
      earlyAccessOn: false,
      earlyAccessText: '',
      showExamples: true,
    },
    'Reset after a test.',
  );
  forgetSettings();
});

describe('the standard values', () => {
  it('start at $5 to $70, a $50 safety check, and the bar off', async () => {
    forgetSettings();
    expect(await getSettings()).toEqual({ priceMinCents: 500, priceMaxCents: 7000, holdNewBuyerMinCents: 5000, earlyAccessOn: false, earlyAccessText: '', showExamples: true });
    expect(CONFIG.sale).toEqual({ priceMinCents: 500, priceMaxCents: 7000 });
  });
});

describe('what a set of settings may be', () => {
  it('whole dollars inside sensible bounds, the lowest under the highest', () => {
    expect(problemWith(DEFAULTS)).toBeNull();
    expect(problemWith({ ...DEFAULTS, priceMinCents: 50 })).toMatch(/Lowest price/);
    expect(problemWith({ ...DEFAULTS, priceMinCents: 7000, priceMaxCents: 7000 })).toMatch(/less than/);
    expect(problemWith({ ...DEFAULTS, priceMaxCents: 10_000_000 })).toMatch(/Highest price/);
    expect(problemWith({ ...DEFAULTS, holdNewBuyerMinCents: -1 })).toMatch(/safety check/);
    expect(problemWith({ ...DEFAULTS, holdNewBuyerMinCents: 0 })).toBeNull(); // never
    expect(problemWith({ ...DEFAULTS, earlyAccessText: 'x'.repeat(201) })).toMatch(/200 characters/);
    expect(problemWith({ ...DEFAULTS, priceMinCents: 5.5 })).toMatch(/whole dollars/);
  });
});

describe('an admin changes them', () => {
  it('needs a reason, takes effect at once, is audited with before and after, and refuses nonsense and no-ops', async () => {
    expect((await setSettings('admin-1', { priceMaxCents: 12_000 }, 'no')).ok).toBe(false);
    expect((await setSettings('admin-1', {}, 'Nothing to change really.')).ok).toBe(false);
    expect((await setSettings('admin-1', { priceMinCents: 9000 }, 'Min above the max is wrong.')).ok).toBe(false);
    expect(await setSettings('admin-1', { priceMaxCents: 7000 }, 'Same as it is now.')).toMatchObject({ ok: false, status: 409 });
    expect((await setSettings('admin-1', { priceMaxCents: 12_000, priceMinCents: 900 }, 'Opening up a little more.')).ok).toBe(true);
    expect(await getSettings()).toMatchObject({ priceMinCents: 900, priceMaxCents: 12_000 });
    const e = (await auditList(300)).find((x) => x.action === 'settings_changed' && String(x.targetRef).includes('priceMaxCents'));
    expect(e?.detail).toMatchObject({ reason: 'Opening up a little more.', from: { priceMaxCents: 7000 }, to: { priceMaxCents: 12_000 } });
  });
  it('the early access bar words follow the price range unless the admin writes their own', async () => {
    expect(barText({ ...DEFAULTS, priceMinCents: 500, priceMaxCents: 7000 })).toBe('Early access: we are opening in small steps, so for now every product costs between $5 and $70.');
    expect(barText({ ...DEFAULTS, earlyAccessText: 'We open next week.' })).toBe('We open next week.');
    expect((await setSettings('admin-1', { earlyAccessOn: true }, 'Telling visitors we are early.')).ok).toBe(true);
    expect((await getSettings()).earlyAccessOn).toBe(true);
  });
  it("the size from which a new buyer's order waits for a check follows the setting, and 0 turns it off", async () => {
    const buyer = `set-b-${Date.now()}`;
    seenFirst(buyer, Date.now());
    const mk = (cents: number) => createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'S', lines: [['S', cents]], days: 1, buyerId: buyer, sellerId: 'set-s', demo: false });
    const o = await mk(3000);
    expect(await holdReasonFor(o)).toBeNull(); // under $50
    expect((await setSettings('admin-1', { holdNewBuyerMinCents: 2000 }, 'Lower the check to $20.')).ok).toBe(true);
    expect(await holdReasonFor(o)).toMatch(/new account/i);
    expect((await setSettings('admin-1', { holdNewBuyerMinCents: 0 }, 'Turn the check off for now.')).ok).toBe(true);
    expect(await holdReasonFor(o)).toBeNull();
  });
});
