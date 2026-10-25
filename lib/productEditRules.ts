import { catsFor } from './apps';
import { type ThemeKey } from './data';
import { isLicenceType } from './licences';
import { isWebCat } from './webCategories';
import { CONFIG } from './config';

/*
 * What an admin may change on a seller's listing (/dashboard/admin/seo/product): the words, category, price, delivery time, links and the prices of
 * the extras. The same limits as the seller's own form, so an admin cannot put a listing in a state the form would refuse. Never the private code
 * link, the licence or who owns it. Pure, so it is tested; the saving is lib/admin/productEdit.ts.
 */
export type ProductEditInput = {
  name: string;
  category: string;
  desc: string;
  includes: string; // one per line
  price: number; // dollars
  days: number;
  demo: string;
  sample: string;
  docsUrl: string;
  requirements: string;
  express: string; // dollars or empty
  setupPrice: number; // dollars, 0 = not offered
  customPrice: number;
  supportDays: number;
  updateDays: number;
  codeUrl?: string; // the seller's private files link (https); not sent = unchanged
  licenceType?: string; // single_project, multi_project or full_transfer; not sent = unchanged
};

export type ProductEditRow = {
  name: string;
  category: string;
  tagline: string;
  description: string;
  includes: string[];
  theme: ThemeKey;
  price_cents: number;
  delivery_days: number;
  demo_url: string;
  sample_url: string | null;
  docs_url: string | null;
  requirements: string | null;
  express_price_cents: number | null;
  setup_price_cents: number;
  custom_price_cents: number;
  support_days: number;
  update_days: number;
  code_url?: string;
  licence_type?: string;
};

const THEME: Record<string, ThemeKey> = {
  'E-commerce Templates': 'store',
  'SaaS & Startup Templates': 'saas',
  'Portfolio & Agency Templates': 'portfolio',
  Restaurants: 'restaurant',
  Health: 'clinic',
  Portfolios: 'portfolio',
  Stores: 'store',
  'Landing pages': 'saas',
  'Real estate': 'estate',
  Tools: 'tool',
};
const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

export type Check = { ok: true; row: ProductEditRow } | { ok: false; error: string };

export function checkProductEdit(i: ProductEditInput, ctx: { platform: string; priceMinCents: number; priceMaxCents: number; hasHostedDemo: boolean }): Check {
  const isApp = ctx.platform !== 'web';
  const dig = ctx.platform === 'digital';
  const name = i.name.trim();
  const desc = i.desc.trim();
  if (name.length < 3 || name.length > 60) return { ok: false, error: 'The name must be 3 to 60 characters.' };
  if (desc.length < CONFIG.listing.minDescChars || desc.length > 600) return { ok: false, error: `The description must be ${CONFIG.listing.minDescChars} to 600 characters.` };
  if (isApp ? !catsFor(ctx.platform as never).includes(i.category) : !isWebCat(i.category)) return { ok: false, error: 'Pick one of the categories of this kind of product.' };
  const includes = i.includes
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.slice(0, 120));
  if (includes.length < CONFIG.listing.minIncluded || includes.length > CONFIG.listing.maxIncluded)
    return { ok: false, error: `List ${CONFIG.listing.minIncluded} to ${CONFIG.listing.maxIncluded} things that come with it, one per line.` };
  if (!Number.isInteger(i.price) || i.price * 100 < ctx.priceMinCents || i.price * 100 > ctx.priceMaxCents)
    return { ok: false, error: `The price must be a whole number of dollars from $${ctx.priceMinCents / 100} to $${ctx.priceMaxCents / 100}.` };
  if (!Number.isInteger(i.days) || i.days < CONFIG.delivery.minDays || i.days > CONFIG.delivery.maxDays)
    return { ok: false, error: `Delivery takes ${CONFIG.delivery.minDays} to ${CONFIG.delivery.maxDays} days.` };
  const demo = i.demo.trim();
  if (demo && !isHttps(demo)) return { ok: false, error: 'The demo link must start with https.' };
  if (!isApp && !demo && !ctx.hasHostedDemo) return { ok: false, error: 'A website needs a demo link, or the hosted demo the seller uploaded.' };
  const sample = i.sample.trim();
  if (sample && !isHttps(sample)) return { ok: false, error: 'The free sample link must start with https.' };
  const docs = i.docsUrl.trim();
  if (docs && !isHttps(docs)) return { ok: false, error: 'The documentation link must start with https.' };
  const requirements = i.requirements.trim();
  if (requirements.length > CONFIG.listing.requirementsMax) return { ok: false, error: `What it needs can have up to ${CONFIG.listing.requirementsMax} characters.` };
  let express: number | null = null;
  if (i.express.trim() !== '') {
    const d = Number(i.express);
    if (!Number.isInteger(d) || d * 100 < CONFIG.delivery.expressMinCents || d * 100 > CONFIG.delivery.expressMaxCents)
      return { ok: false, error: `Express delivery costs $${CONFIG.delivery.expressMinCents / 100} to $${CONFIG.delivery.expressMaxCents / 100}, or leave it empty.` };
    express = d * 100;
  }
  if (!CONFIG.packages.setupCents.includes(i.setupPrice * 100)) return { ok: false, error: 'Pick one of the allowed prices for setup help.' };
  if (!CONFIG.packages.customCents.includes(i.customPrice * 100)) return { ok: false, error: 'Pick one of the allowed prices for customisation.' };
  if (i.price * 100 + i.setupPrice * 100 > ctx.priceMaxCents || i.price * 100 + i.customPrice * 100 > ctx.priceMaxCents)
    return { ok: false, error: `The price plus setup help or customisation must stay under $${ctx.priceMaxCents / 100}.` };
  for (const d of [i.supportDays, i.updateDays]) if (!CONFIG.listing.periodDays.includes(d)) return { ok: false, error: 'Support and updates last 0, 30, 90, 180 or 365 days.' };
  const codeUrl = (i.codeUrl ?? '').trim();
  if (i.codeUrl !== undefined && (!codeUrl || !isHttps(codeUrl))) return { ok: false, error: 'The files link must start with https.' };
  if (i.licenceType !== undefined && !isLicenceType(i.licenceType)) return { ok: false, error: 'Pick one of the licence types.' };
  if (/[<>]/.test(name + desc + includes.join('') + requirements)) return { ok: false, error: 'Leave out < and > in the words.' };
  return {
    ok: true,
    row: {
      name,
      category: i.category,
      tagline: i.category,
      description: desc,
      includes,
      theme: isApp ? 'bio' : (THEME[i.category] ?? 'bio'),
      price_cents: i.price * 100,
      delivery_days: i.days,
      demo_url: demo || 'about:blank',
      sample_url: dig && sample ? sample : null,
      docs_url: dig && docs ? docs : null,
      requirements: dig && requirements ? requirements : null,
      express_price_cents: express,
      setup_price_cents: i.setupPrice * 100,
      custom_price_cents: i.customPrice * 100,
      support_days: dig ? i.supportDays : 0,
      update_days: dig ? i.updateDays : 0,
      ...(i.codeUrl !== undefined ? { code_url: codeUrl } : {}),
      ...(i.licenceType !== undefined ? { licence_type: i.licenceType } : {}),
    },
  };
}
