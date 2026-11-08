/*
 * What a BUYER may ask for when requesting a product (SellOnBay 2.0, section 9 of the implementation brief). Non-exclusive by default: the same
 * product is sold to many buyers, each with their own licence. Exclusive ownership or a full copyright transfer is never chosen like a tier:
 * the buyer can only ask for it, and it needs a special admin review plus a legal/IP review that checks the rights of earlier buyers (F-10).
 * The text version is stored on every quotation and order, so a buyer always sees the words they accepted. [LAWYER REVIEW] all texts.
 * Safe in the browser.
 */
export const LICENCE_TEXT_VERSION = '2026-10-27-draft';

export const BUYER_TIERS = ['single_project', 'multi_project', 'extended_commercial'] as const;
export type BuyerTier = (typeof BUYER_TIERS)[number];
export type RequestedTier = BuyerTier | 'exclusive_review';

export const TIER_TEXT: Record<RequestedTier, { label: string; terms: string }> = {
  single_project: {
    label: 'Single project',
    terms: 'Use it for one end website, for yourself or for one client. Not exclusive: others may buy the same product. No resale or redistribution of the product itself.',
  },
  multi_project: { label: 'Multi project', terms: 'Use it for as many projects of your own or your clients as you like. Not exclusive. No resale or redistribution of the product itself.' },
  extended_commercial: {
    label: 'Extended commercial',
    terms: 'Use it in a product or service you sell to many end users (for example a paid app or SaaS). Not exclusive. No resale of the source code as a template or kit.',
  },
  exclusive_review: {
    label: 'Ask about exclusive ownership',
    terms: 'Exclusive rights or a full transfer are only possible after a special review by SellOnBay and a legal check of earlier buyers’ licences. Nothing is promised until a quotation says so.',
  },
};
export const isRequestedTier = (v: unknown): v is RequestedTier => typeof v === 'string' && Object.hasOwn(TIER_TEXT, v);
