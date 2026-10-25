/*
 * Single source of truth for money, time and permission rules. Every number the product promises lives here, has a unit test (tests/config.test.ts)
 * and is imported by the code and the copy. Do not write 15, 20, 48 or 7 anywhere else. Money is whole cents. Percentages are basis points (100 = 1%).
 */
export const CONFIG = {
  delivery: { minDays: 1, maxDays: 7, expressHours: 24, expressMinCents: 1000, expressMaxCents: 2000 },
  review: { hours: 48 }, // after delivery; no action means auto-accepted
  payout: { holdDays: 7, weekday: 0 }, // weekly on Sunday, only earnings accepted at least holdDays ago
  bugFixDays: 7, // after acceptance: the seller fixes bugs, it is not a refund
  // ready-made sales: 30% when the seller's price is under $20, else 22%; custom, extra and trial work 20%
  fees: { saleBps: 2200, saleLowBps: 3000, saleLowBelowCents: 2000, customBps: 2000 },
  dispute: { sellerReplyHours: 48, adminDecisionDays: 5, flagAfterRejected: 3 },
  extraWork: { titleMax: 80, minCents: 500, maxCents: 50000, minDays: 1, maxDays: 3, maxPending: 3 }, // max $500 (owner, 2026-10-12)
  trial: { minDays: 3, maxDays: 5, maxPriceCents: 15000, creditWindowDays: 30 }, // starter trial package
  download: { linkHours: 24, linksPerHourPerOrder: 5, ipPerHour: 30, maxFileMb: 50 }, // maxFileMb: the largest seller file that can be virus-scanned, so the largest a buyer can get
  trialCopy: { linkMinutes: 60, perBuyerProductDays: 7, requestsPerDay: 3, maxFileMb: 25 }, // limited copy before purchase (feature flag)
  chat: { warnAtBlocks: 3, suspendAtBlocks: 5, windowDays: 30, suspendDays: 7, maxChars: 2000, perUserBurst: [20, 1] as readonly [number, number] }, // perUserBurst: [messages, minutes]
  presale: { perPairPerDay: 5, perBuyerPerDay: 20, userBurst: [5, 10] as const, ipBurst: [10, 10] as const }, // [count, minutes]
  domain: { reminderDays: [30, 7, 1] as readonly number[] }, // renewal reminders before a bought domain expires
  limits: {
    newAccountDays: 7, // an account younger than this gets the lower `newMax` limits
    keepDays: 90, // how long the hashed connection and device events are kept
    // per person (0 = no limit), per connection (0 = no limit), window in hours, and the lower per-person limit for a new account
    actions: {
      signup: { perUser: 0, perIp: 5, hours: 1, newMax: 0, perEmail: 0 },
      login: { perUser: 0, perIp: 30, hours: 1, newMax: 0, perEmail: 50 }, // perEmail: tries on one mailbox from any address, so a changing address cannot guess a password
      reset: { perUser: 0, perIp: 5, hours: 1, newMax: 0, perEmail: 3 }, // password reset emails
      order: { perUser: 20, perIp: 30, hours: 1, newMax: 5, perEmail: 0 },
      listing: { perUser: 10, perIp: 15, hours: 24, newMax: 0, perEmail: 0 },
      hire: { perUser: 10, perIp: 15, hours: 24, newMax: 3, perEmail: 0 },
      developer: { perUser: 5, perIp: 10, hours: 24, newMax: 2, perEmail: 0 },
      dispute: { perUser: 5, perIp: 10, hours: 24, newMax: 2, perEmail: 0 },
      extra: { perUser: 20, perIp: 40, hours: 24, newMax: 6, perEmail: 0 },
    },
    cluster: { accounts: 4, hours: 24 }, // this many accounts on one connection or device raises an alert
    burst: { hits: 10, hours: 1 }, // this many refused requests from one connection raises an alert
  },
  // a GitHub invitation runs out after 7 days; remind the buyer a day before. If the buyer never confirms access, it counts as confirmed
  // autoConfirmDays after the last invite and the review starts (owner, 2026-10-12). Longer than inviteDays, so a lapsed invite is noticed and
  // sent again before the review starts (owner, 2026-10-13: 10 days).
  repo: { inviteDays: 7, reminderHours: 24, maxResends: 5, autoConfirmDays: 10 },
  // What a seller may charge on top of the price for "with setup help" and "with customisation" (0 = not offered). The defaults are what every listing had before sellers chose.
  packages: {
    setupCents: [0, 1000, 2000, 3000, 5000, 7500, 10000, 15000] as readonly number[],
    customCents: [0, 5000, 10000, 15000, 25000, 50000, 100000] as readonly number[],
    defaultSetupCents: 3000,
    defaultCustomCents: 10000,
  },
  reserve: { percent: 0, days: 0 }, // a share of seller earnings kept back for some days after the payout hold; OFF until the owner decides (per-seller overrides on the Risk page)
  sale: { priceMinCents: 500, priceMaxCents: 7000 }, // the price range of what is sold while the shop is opening in small steps; an admin can change it in Settings
  risk: {
    holdNewBuyerMinCents: 5000, // a new account's paid order of this much or more waits for an admin's safety check before the seller starts
    // an unusual rise: today is at least `factor` times the average of the days before, and at least minToday
    anomaly: { baselineDays: 7, factor: 3, minToday: { accounts: 20, orders: 20, disputes: 5, refunds: 5, reports: 10, failed_payments: 15 } },
  },
  dashboard: { chartWeeks: 8 }, // weeks shown in the seller earnings chart
  abuse: { autoSuspendReports: 3, windowDays: 7, perIpPerHour: 5 }, // different reporters in the window that pause a listing by themselves
  notify: { dueSoonHours: 6, reviewEndingHours: 12 }, // reminders before a delivery is due and before a review ends
  ai: { freeRunsPerDay: 5, cacheDays: 30 },
  // visitor analytics (lib/analytics.ts): days of rows kept, rows in each top list, events one visitor may send a minute, stored daily reports listed,
  // and when a product counts as attractive (enough different viewers, and the share of them who clicked Buy)
  analytics: { keepDays: 90, topRows: 15, perVisitorPerMinute: 60, reportsShown: 30, attraction: { minViewers: 10, strongPct: 10, fairPct: 3 } },
  catalogCacheSeconds: 60, // each server copy keeps the public list of live listings this long (lib/catalog.ts); never checkout, orders or user data
  emailQueue: { maxAttempts: 5, retryMinutes: [1, 5, 30, 120] as readonly number[], batch: 50 }, // lib/emailQueue.ts: tries per email, wait before each retry, emails per scheduled run
  orderReuseMinutes: 10, // a second Buy of the same thing by the same buyer within this time opens the unpaid order instead of a new one
  cron: { ordersStaleMinutes: 30, payoutsStaleDays: 8, ledgerRecheckDays: 3 }, // the launch check warns when a scheduled job has not finished for this long; orders that left the open states are re-checked in the ledger for ledgerRecheckDays
  extras: { aiContentCents: 300, hostingMonthCents: 400, storeListingCents: 900, installerSetupCents: 1500 },
  listing: { periodDays: [0, 30, 90, 180, 365] as readonly number[], requirementsMax: 600, minShots: 1, maxShots: 6, minDescChars: 20, minIncluded: 1, maxIncluded: 8 },
} as const;

export type FeeKind = 'sale' | 'custom';
/* A sale's fee depends on the seller's price: a small sale pays the higher rate. */
export const feeBps = (kind: FeeKind, priceCents = Infinity) => (kind === 'custom' ? CONFIG.fees.customBps : priceCents < CONFIG.fees.saleLowBelowCents ? CONFIG.fees.saleLowBps : CONFIG.fees.saleBps);

/* The platform's cut, rounded half up to whole cents. The seller gets the rest, so the two always add up to the price. */
export const feeCents = (priceCents: number, kind: FeeKind) => Math.round((priceCents * feeBps(kind, priceCents)) / 10_000);
export const sellerNetCents = (priceCents: number, kind: FeeKind) => priceCents - feeCents(priceCents, kind);

/* Plain words for copy: 1500 -> "15%". */
export const pct = (bps: number) => `${bps / 100}%`;
export const FEE_SALE_TEXT = `${pct(CONFIG.fees.saleBps)} (${pct(CONFIG.fees.saleLowBps)} under $${CONFIG.fees.saleLowBelowCents / 100})`;
export const FEE_CUSTOM_TEXT = pct(CONFIG.fees.customBps);
/* What the seller keeps of a sale: "78% (70% under $20)". */
export const SELLER_KEEP_TEXT = `${pct(10_000 - CONFIG.fees.saleBps)} (${pct(10_000 - CONFIG.fees.saleLowBps)} under $${CONFIG.fees.saleLowBelowCents / 100})`;
/*
 * Owner, 2026-10-20: lists (home, shelves, cards, compare, finder) show no prices; the price appears on the product page beside
 * Buy and in full at checkout, before anything is paid. Consumer law needs the total before the buyer commits, so never hide it there.
 */
export const SHOW_LIST_PRICES = false;
export const REVIEW_HOURS = CONFIG.review.hours;
export const PAYOUT_HOLD_DAYS = CONFIG.payout.holdDays;
export const BUGFIX_DAYS = CONFIG.bugFixDays;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
