import { BRAND_DOMAIN, BRAND_NAME } from './brand';

/*
 * Which address does what (owner, 2026-11-07). Pages and jobs ask for a purpose here and never write an address themselves. Human inboxes are on Zoho Mail.
 * Safe in the browser: these addresses are public.
 */
export const EMAIL_ROUTES = {
  sales: `sales@${BRAND_DOMAIN}`, // new checkout and beta requests
  support: `support@${BRAND_DOMAIN}`, // sender for buyer emails, ticket replies, help and contact form
  billing: `billing@${BRAND_DOMAIN}`, // invoices, receipts, payment and payout questions
  business: `business@${BRAND_DOMAIN}`, // partnerships and seller onboarding
  report: `report@${BRAND_DOMAIN}`, // abuse, report seller, DMCA, security reports
  dev: `dev@${BRAND_DOMAIN}`, // system errors, health alerts, failed jobs
  administrator: `administrator@${BRAND_DOMAIN}`, // critical admin and security alerts
} as const;
export type EmailPurpose = keyof typeof EMAIL_ROUTES;

export const emailSenderFor = (purpose: EmailPurpose = 'support') => `${BRAND_NAME} <${EMAIL_ROUTES[purpose]}>`;
/* The same with an address an admin saved (Admin › Settings › Contact & social, lib/site/contentStore.ts contactRoutes). */
export const senderFrom = (address: string) => `${BRAND_NAME} <${address}>`;

/*
 * While the redesign is built, real email goes only to our own addresses and test addresses; everything else is logged and dropped (owner, 2026-11-07).
 * EMAIL_ALLOW_TO adds the owner's own addresses, comma separated. EMAIL_ALLOW_ALL=1 lifts this at launch.
 */
export const TEST_EMAIL_DOMAIN = 'test.sellonbay.dev';
export function emailAllowed(to: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.EMAIL_ALLOW_ALL === '1') return true;
  const address = (/<([^<>]+)>/.exec(to)?.[1] ?? to).trim().toLowerCase();
  const domain = address.split('@').pop();
  if (domain === BRAND_DOMAIN.toLowerCase() || domain === TEST_EMAIL_DOMAIN) return true;
  const own = (env.EMAIL_ALLOW_TO ?? '').split(',').map((a) => a.trim().toLowerCase());
  return own.includes(address);
}
/* For a log line: enough to recognise, not enough to read off an address. */
export const maskEmail = (to: string) => {
  const address = (/<([^<>]+)>/.exec(to)?.[1] ?? to).trim();
  const [name, domain] = address.split('@');
  return `${name?.slice(0, 2) ?? ''}***@${domain ?? ''}`;
};
