import { deliveryOf } from './apps';
import type { Product } from './data';
import { DEFAULT_LICENCE, type LicenceType, type ThirdParty } from './licences';
import type { DeliveryType } from './orders/machine';

/* How a product is handed over, which licence comes with it and what third-party code is inside. Starter listings are set here; seller listings carry their own. */
const STARTER_REPO = ['seo-audit', 'support-bot', 'wp-booking']; // delivered by inviting the buyer's GitHub account
const STARTER_LICENCE: Record<string, LicenceType> = { 'saas-ui-kit': 'multi_project', 'webflow-agency': 'multi_project', 'make-invoices': 'multi_project' };
const STARTER_THIRD_PARTY: Record<string, ThirdParty> = {
  'wp-booking': [
    { name: 'Date picker', licence: 'MIT' },
    { name: 'Chart helper', licence: 'GPL-2.0' },
  ],
  'seo-audit': [{ name: 'HTTP client library', licence: 'Apache-2.0' }],
};

/* Starter listings that offer 24-hour express delivery, in dollars (between the express limits in lib/config.ts). Seller listings carry their own. */
const STARTER_EXPRESS: Record<string, number> = { 'saffron-table': 15, 'clinic-desk': 20, 'folio-studio': 10, shopline: 12, 'seo-audit': 10, 'wp-booking': 15, taskboard: 18 };
export const expressOf = (p: Product): number | undefined => p.express ?? STARTER_EXPRESS[p.id];

export const deliveryTypeOf = (p: Product): DeliveryType => {
  if (p.repo || STARTER_REPO.includes(p.id)) return 'repo_access';
  const dv = deliveryOf(p);
  return dv === null || dv === 'host' ? 'live_site' : 'download';
};
export const licenceOf = (p: Product): LicenceType => p.licence ?? STARTER_LICENCE[p.id] ?? DEFAULT_LICENCE;
export const thirdPartyOf = (p: Product): ThirdParty => p.thirdParty ?? STARTER_THIRD_PARTY[p.id] ?? [];

/* A GitHub account name: letters, digits and single hyphens, up to 39 characters, never starting or ending with a hyphen. */
export const GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
