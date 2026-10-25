import { BRAND_DOMAIN } from './brand';

/* The address of the site, for the sitemap, share cards and emails. NEXT_PUBLIC_SITE_URL wins; a production build without it uses the brand domain, never localhost. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === 'production' ? `https://${BRAND_DOMAIN}` : 'http://localhost:3000')).replace(/\/$/, '');
export const SITE_NAME = 'SellOnBay';
