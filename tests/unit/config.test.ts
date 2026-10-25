import { describe, expect, it } from 'vitest';
import { BRAND_NAME } from '@/lib/brand';
import { CONFIG, FEE_CUSTOM_TEXT, FEE_SALE_TEXT, SELLER_KEEP_TEXT, feeCents, sellerNetCents } from '@/lib/config';

describe('rules in one place', () => {
  it('holds the rules the spec states', () => {
    expect(CONFIG.delivery).toMatchObject({ minDays: 1, maxDays: 7, expressHours: 24 });
    expect(CONFIG.review.hours).toBe(48);
    expect(CONFIG.payout.holdDays).toBe(7);
    expect(CONFIG.bugFixDays).toBe(7);
    expect(CONFIG.fees).toEqual({ saleBps: 2200, saleLowBps: 3000, saleLowBelowCents: 2000, customBps: 2000 });
    expect(CONFIG.dispute).toMatchObject({ sellerReplyHours: 48, adminDecisionDays: 5 });
    expect(CONFIG.extraWork).toEqual({ titleMax: 80, minCents: 500, maxCents: 50000, minDays: 1, maxDays: 3, maxPending: 3 });
    expect(CONFIG.trial).toMatchObject({ minDays: 3, maxDays: 5, maxPriceCents: 15000, creditWindowDays: 30 });
    expect(CONFIG.download.linkHours).toBe(24);
    expect(CONFIG.download.maxFileMb).toBe(50); // the scan limit: a file must be scanned clean to be delivered
    expect(CONFIG.chat).toMatchObject({ warnAtBlocks: 3, suspendAtBlocks: 5, windowDays: 30, suspendDays: 7, maxChars: 2000, perUserBurst: [20, 1] });
    expect(CONFIG.ai.freeRunsPerDay).toBe(5);
    expect(CONFIG.domain.reminderDays).toEqual([30, 7, 1]);
    expect(CONFIG.abuse).toEqual({ autoSuspendReports: 3, windowDays: 7, perIpPerHour: 5 });
    expect(CONFIG.analytics).toEqual({ keepDays: 90, topRows: 15, perVisitorPerMinute: 60, reportsShown: 30, attraction: { minViewers: 10, strongPct: 10, fairPct: 3 } }); // lib/analytics.ts
    expect(CONFIG.catalogCacheSeconds).toBe(60); // public live-listing list only (lib/catalog.ts)
    expect(CONFIG.emailQueue).toEqual({ maxAttempts: 5, retryMinutes: [1, 5, 30, 120], batch: 50 }); // lib/emailQueue.ts
    expect(CONFIG.orderReuseMinutes).toBe(10); // a second Buy of the same thing opens the unpaid order (lib/orders/service.ts)
    expect(CONFIG.listing.periodDays).toEqual([0, 30, 90, 180, 365]);
    expect(CONFIG.listing.requirementsMax).toBe(600);
    expect(CONFIG.repo).toEqual({ inviteDays: 7, reminderHours: 24, maxResends: 5, autoConfirmDays: 10 });
    expect(CONFIG.packages).toEqual({
      setupCents: [0, 1000, 2000, 3000, 5000, 7500, 10000, 15000],
      customCents: [0, 5000, 10000, 15000, 25000, 50000, 100000],
      defaultSetupCents: 3000,
      defaultCustomCents: 10000,
    });
    expect(CONFIG.sale).toEqual({ priceMinCents: 500, priceMaxCents: 7000 });
    expect(CONFIG.reserve).toEqual({ percent: 0, days: 0 });
    expect(CONFIG.risk).toEqual({
      holdNewBuyerMinCents: 5000,
      anomaly: { baselineDays: 7, factor: 3, minToday: { accounts: 20, orders: 20, disputes: 5, refunds: 5, reports: 10, failed_payments: 15 } },
    });
    expect(CONFIG.dashboard).toEqual({ chartWeeks: 8 });
    expect(CONFIG.limits).toMatchObject({ newAccountDays: 7, keepDays: 90, cluster: { accounts: 4, hours: 24 }, burst: { hits: 10, hours: 1 } });
    expect(CONFIG.limits.actions.order).toEqual({ perUser: 20, perIp: 30, hours: 1, newMax: 5, perEmail: 0 });
    expect(CONFIG.notify).toEqual({ dueSoonHours: 6, reviewEndingHours: 12 });
    expect(CONFIG.extras).toEqual({ aiContentCents: 300, hostingMonthCents: 400, storeListingCents: 900, installerSetupCents: 1500 });
  });
  it('fees: 22% on sales (30% under $20), 20% on custom, extra and trial work', () => {
    expect(feeCents(10_000, 'sale')).toBe(2200);
    expect(feeCents(2000, 'sale')).toBe(440); // $20 and up: 22%
    expect(feeCents(1900, 'sale')).toBe(570); // under $20: 30%
    expect(feeCents(500, 'sale')).toBe(150);
    expect(feeCents(1900, 'custom')).toBe(380); // custom work stays 20% at any price
    expect(feeCents(10_000, 'custom')).toBe(2000);
    expect(FEE_SALE_TEXT).toBe('22% (30% under $20)');
    expect(FEE_CUSTOM_TEXT).toBe('20%');
    expect(SELLER_KEEP_TEXT).toBe('78% (70% under $20)');
  });
  it('fee and payout always add up to the price, whatever the rounding', () => {
    for (const price of [1, 3, 99, 333, 1999, 2901, 14_999, 15_000]) {
      for (const kind of ['sale', 'custom'] as const) expect(feeCents(price, kind) + sellerNetCents(price, kind)).toBe(price);
    }
    expect(feeCents(333, 'custom')).toBe(67); // 66.6 rounds
  });
  it('the name comes from one file', () => expect(BRAND_NAME).toBe('SellOnBay'));
});
