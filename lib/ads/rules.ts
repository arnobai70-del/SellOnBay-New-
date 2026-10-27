import { checkMessage } from '../chatFilter';
import { CONFIG, DAY_MS } from '../config';
import type { FlagKey } from '../featureFlagRegistry';

/*
 * Seller promotions (SellOnBay 2.0, Blueprint 9, Addendum 6.7, O-10). Pure, tested.
 * Model A only: the seller connects their OWN Meta or Google Ads account and the platform bills the seller. SellOnBay never runs ads from its
 * own account and never charges the seller for ads. Before Meta and Google confirm access in writing (B-9) and counsel reviews the terms
 * (B-10), NO code calls an advertising API: there is no platform adapter (lib/ads/adapter.ts), both flags are locked, and a promotion can
 * only be drafted and reviewed. No customer lists, no buyer data, and no advertising pixel on sellonbay.com.
 *
 *   draft --seller sends--> in_review --Catalog approves--> approved --(adapter, after B-9)--> live --> paused / ended
 *                                     --Catalog rejects--> rejected --seller edits--> draft
 */
export const AD_PLATFORMS = { meta: { label: 'Meta (Facebook and Instagram)', flag: 'ads.meta' }, google: { label: 'Google Ads', flag: 'ads.google' } } as const satisfies Record<
  string,
  { label: string; flag: FlagKey }
>;
export type AdPlatform = keyof typeof AD_PLATFORMS;
export const isAdPlatform = (p: unknown): p is AdPlatform => typeof p === 'string' && Object.hasOwn(AD_PLATFORMS, p);

export type PromoState = 'draft' | 'in_review' | 'approved' | 'rejected' | 'live' | 'paused' | 'ended';
export const PROMO_MOVES: Record<PromoState, readonly PromoState[]> = {
  draft: ['in_review', 'ended'],
  in_review: ['approved', 'rejected'],
  rejected: ['draft', 'ended'],
  approved: ['live', 'ended'], // live only through a platform adapter, which does not exist before B-9
  live: ['paused', 'ended'],
  paused: ['live', 'ended'],
  ended: [],
};
export const canMovePromo = (from: PromoState, to: PromoState) => PROMO_MOVES[from].includes(to);

export type PromoInput = { platform: AdPlatform; productSlug: string; headline: string; text: string; dailyBudgetCents: number; days: number };

/* Text and budget checks. The budget is the seller's own money on their own account; these are SellOnBay's guardrails on what it submits. */
export function checkPromo(raw: Record<string, unknown>): { ok: true; value: PromoInput } | { ok: false; error: string } {
  const platform = raw.platform;
  if (!isAdPlatform(platform)) return { ok: false, error: 'Choose Meta or Google Ads.' };
  const productSlug = String(raw.productSlug ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(productSlug)) return { ok: false, error: 'Choose one of your live listings.' };
  const headline = String(raw.headline ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const text = String(raw.text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (headline.length < 5 || headline.length > CONFIG.ads.headlineMax) return { ok: false, error: `The headline is 5 to ${CONFIG.ads.headlineMax} characters.` };
  if (text.length < 10 || text.length > CONFIG.ads.textMax) return { ok: false, error: `The text is 10 to ${CONFIG.ads.textMax} characters.` };
  if (![headline, text].every((t) => checkMessage(t).ok)) return { ok: false, error: 'Ads cannot carry contact details, links or payment instructions. The ad links to the listing.' };
  if (/\b(guarantee[ds]?|100%|risk[- ]free|best in the world|#1)\b/i.test(`${headline} ${text}`)) return { ok: false, error: 'Avoid promises we cannot keep, such as "guaranteed" or "#1".' };
  const daily = Number(raw.dailyBudgetCents);
  const days = Number(raw.days);
  if (!Number.isInteger(daily) || daily < CONFIG.ads.minDailyCents || daily > CONFIG.ads.maxDailyCents)
    return { ok: false, error: `The daily budget is $${CONFIG.ads.minDailyCents / 100} to $${CONFIG.ads.maxDailyCents / 100}.` };
  if (!Number.isInteger(days) || days < 1 || days > CONFIG.ads.maxDays) return { ok: false, error: `A promotion runs 1 to ${CONFIG.ads.maxDays} days.` };
  if (daily * days > CONFIG.ads.maxTotalCents) return { ok: false, error: `The total budget can be at most $${CONFIG.ads.maxTotalCents / 100}.` };
  return { ok: true, value: { platform, productSlug, headline, text, dailyBudgetCents: daily, days } };
}

/* The ad's landing page: the public listing address with campaign words. Nothing about any buyer goes into it. */
export function landingUrl(origin: string, publicPath: string, platform: AdPlatform, promoId: string): string {
  const u = new URL(publicPath, origin);
  u.searchParams.set('utm_source', platform);
  u.searchParams.set('utm_medium', 'paid_social');
  u.searchParams.set('utm_campaign', `promo-${promoId.slice(0, 8)}`);
  return u.toString();
}

export const endsAt = (startAt: number, days: number) => startAt + days * DAY_MS;
