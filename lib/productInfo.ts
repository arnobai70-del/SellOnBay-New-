import { DAY_MS } from './config';
import type { Product } from './data';

/*
 * What a buyer is told about a digital product before and after paying: where the guide is, what it needs, and for how many days (from the purchase)
 * the seller helps and sends updates. Pure, so the product page, the order page and the tests all read it the same way. 0 days means none.
 */
export type ProductInfo = { docsUrl?: string; requirements?: string; supportDays: number; updateDays: number };

export const infoOf = (p: Pick<Product, 'platform' | 'docsUrl' | 'requirements' | 'supportDays' | 'updateDays'>): ProductInfo | null =>
  p.platform === 'digital' ? { docsUrl: p.docsUrl, requirements: p.requirements, supportDays: p.supportDays ?? 0, updateDays: p.updateDays ?? 0 } : null;

export const periodText = (days: number) => (days <= 0 ? 'None' : days % 365 === 0 ? `${days / 365} ${days === 365 ? 'year' : 'years'}` : `${days} days`);

/* Until when a period lasts for a buyer who paid at `fundedAt`; null when there is none. */
export const endsAt = (fundedAt: number | undefined, days: number) => (fundedAt !== undefined && days > 0 ? fundedAt + days * DAY_MS : null);
export const isActive = (fundedAt: number | undefined, days: number, now = Date.now()) => {
  const end = endsAt(fundedAt, days);
  return end !== null && now <= end;
};

/* The period a buyer gets: what the listing promised when they ordered, or more if the seller has since made it longer. A seller who shortens it
   later never cuts off an earlier buyer. Orders made before the promise was kept on the order (undefined) use the listing's current value. */
export const promisedDays = (onOrder: number | null | undefined, onListing: number) => Math.max(onOrder ?? 0, onListing);

/* Made-up details for the starter digital products, so the page shows what a real listing will show. */
export const STARTER_INFO: Record<string, Omit<ProductInfo, 'docsUrl'> & { docsUrl?: string }> = {
  'saas-ui-kit': { requirements: 'Figma (free account is enough). Works with any recent Figma desktop or web version.', supportDays: 30, updateDays: 0 },
  'notion-crm': { requirements: 'A Notion account. The free plan works; some views need a paid workspace.', supportDays: 30, updateDays: 0 },
  'webflow-agency': { requirements: 'A Webflow account. The CMS needs a CMS or Business site plan to publish.', supportDays: 30, updateDays: 0 },
  'n8n-leads': { requirements: 'An n8n account (cloud or self-hosted, version 1.0 or newer) and a CRM with an API key, such as HubSpot or Pipedrive.', supportDays: 30, updateDays: 0 },
  'make-invoices': { requirements: 'A Make account and an accounting tool Make can connect to (Xero, QuickBooks or a Google Sheet).', supportDays: 30, updateDays: 0 },
  'support-bot': { requirements: 'A website where you can add one script tag, and an API key for your AI provider. A small server to run is included.', supportDays: 90, updateDays: 0 },
  'seo-audit': { requirements: 'Python 3.10 or newer on your own computer. Runs from the command line; no account needed.', supportDays: 30, updateDays: 0 },
  'wp-booking': { requirements: 'WordPress 6.4 or newer and PHP 8.1 or newer. Needs an outgoing email service for confirmations.', supportDays: 90, updateDays: 0 },
};
