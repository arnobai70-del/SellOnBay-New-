/* The product name is SellOnBay (sellonbay.com), decided by the owner in October 2026. Most pages and emails write the name out in their text, so a rename means this file plus a search of the source (tests/unit/brand.test.ts finds the old name) and the colour variables in globals.css. */
export const BRAND_NAME = 'SellOnBay';
export const BRAND_DOMAIN = process.env.NEXT_PUBLIC_BRAND_DOMAIN ?? 'sellonbay.com';
export const BRAND_EMAIL = process.env.NEXT_PUBLIC_BRAND_EMAIL ?? `support@${BRAND_DOMAIN}`;
