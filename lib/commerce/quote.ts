import 'server-only';
import { isPkg, pkgCost, pkgOffered, type Pkg, type Product } from '../data';
import { deliveryOf, platformOf, storeOf } from '../apps';
import { productRecord } from '../catalog';
import { accountLockedOut } from '../supabase/viewer';
import { EXAMPLE_NOTE, examplesBuyable } from '../examples';
import { getSettings } from '../settings';
import { ALL_TLDS, cleanName } from '../domains';
import { domainProvider, mayOfferNewDomain } from '../providers/domain';
import type { Line } from './types';
import { CONFIG } from '../config';
import { GITHUB_NAME, deliveryTypeOf, expressOf } from '../handover';
import { EXPRESS_LABEL } from '../orders/machine';

export type SiteInput = {
  productId?: unknown;
  pkg?: unknown;
  domainMode?: unknown;
  own?: unknown;
  domainName?: unknown;
  ai?: unknown;
  host?: unknown;
  listing?: unknown;
  appName?: unknown;
  oses?: unknown;
  github?: unknown;
  express?: unknown;
};
export type Quote =
  | { error: string }
  | {
      product?: Product;
      sellerId?: string;
      productDbId?: string;
      instant?: boolean;
      title: string;
      productId: string;
      lines: Line[];
      totalCents: number;
      days: number;
      domain?: { name: string; source: 'own' | 'new' };
      appName?: string;
      oses?: string[];
      github?: string;
      express?: boolean;
    };

const PKG_LABEL: Record<'web' | 'app', Record<Pkg, string>> = {
  web: { asis: '', setup: ' with setup help', custom: ' with customisation' },
  app: { asis: '', setup: ' rebranded and built', custom: ' with customisation' },
};
const OWN = /^(?=.{4,80}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/* The price is worked out here from the catalogue. The browser only says what was chosen, never what it costs. */
export async function quoteSite(i: SiteInput): Promise<Quote> {
  const rec = await productRecord(String(i.productId ?? ''));
  // Only a live listing can be bought; a made-up starter is always "live".
  if (!rec || rec.status !== 'live') return { error: 'That product is not available.' };
  const p = rec.product;
  if (p.example && !examplesBuyable()) return { error: EXAMPLE_NOTE };
  const real = !!p.sellerId; // a seller's own listing, not a starter
  // A banned or suspended seller cannot take new orders: they could not deliver them (they are locked out) and must not be paid for them.
  if (real && (await accountLockedOut(p.sellerId))) return { error: 'That product is not available.' };
  if (real) {
    const max = (await getSettings()).priceMaxCents;
    if ((p.price + pkgCost(p, isPkg(i.pkg) ? i.pkg : 'asis')) * 100 > max) return { error: 'This listing is above the price limit for now. Ask the seller to lower the price.' };
  }
  const pkg: Pkg = isPkg(i.pkg) ? i.pkg : 'asis';
  const pl = platformOf(p),
    app = pl !== 'web',
    dv = deliveryOf(p),
    installer = dv === 'installer';
  if (!pkgOffered(p, pkg)) return { error: 'The seller does not offer that option. Pick another.' };
  const lines: Line[] = [[p.name + PKG_LABEL[app ? 'app' : 'web'][pkg], (p.price + pkgCost(p, pkg)) * 100]];
  let domain: { name: string; source: 'own' | 'new' } | undefined;

  if (dv === null || dv === 'host') {
    if (i.domainMode === 'new') {
      if (!mayOfferNewDomain(domainProvider())) {
        return { error: 'Domain registration is not available yet. Use a domain you already own.' };
      }
      const raw = String(i.domainName ?? '').toLowerCase();
      const dot = raw.indexOf('.');
      const name = cleanName(dot > 0 ? raw.slice(0, dot) : raw),
        tld = dot > 0 ? raw.slice(dot) : '';
      if (name.length < 2 || !ALL_TLDS.some(([t]) => t === tld)) return { error: 'Pick a domain from the list.' };
      const hit = (await domainProvider().search(name)).find((r) => r.tld === tld);
      if (!hit || !hit.available) return { error: `${name}${tld} is no longer available. Pick another.` };
      domain = { name: name + tld, source: 'new' };
      lines.push([`Domain ${name + tld} (1 year)`, hit.price * 100]);
    } else {
      const own = String(i.own ?? '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
      if (!OWN.test(own)) return { error: 'Enter your domain, like mybusiness.com.' };
      domain = { name: own, source: 'own' };
    }
  }
  if (!app && i.ai === true) lines.push(['AI content and SEO', CONFIG.extras.aiContentCents]);
  if ((!app || dv === 'host') && i.host === true) lines.push(['Managed hosting, first month', CONFIG.extras.hostingMonthCents]);
  if (dv === 'store' && i.listing === true) lines.push([`${storeOf(p)} listing pack`, CONFIG.extras.storeListingCents]);
  if (installer && i.listing === true) lines.push(['Installer and auto-update setup', CONFIG.extras.installerSetupCents]);

  const instantNow = dv === 'download' && pkg === 'asis' && deliveryTypeOf(p) === 'download';
  const x = expressOf(p);
  if (i.express === true) {
    if (!x) return { error: 'This seller does not offer express delivery.' };
    if (instantNow) return { error: 'This product is delivered at once, so express is not needed.' };
    lines.push([EXPRESS_LABEL, x * 100]);
  }

  let appName: string | undefined, oses: string[] | undefined;
  if (app && dv !== 'download') {
    appName = String(i.appName ?? '')
      .trim()
      .slice(0, 30);
    if (appName.length < 2) return { error: 'Give your app a name.' };
  }
  if (installer) {
    oses = (Array.isArray(i.oses) ? i.oses : []).filter((o): o is string => ['Windows', 'macOS', 'Linux'].includes(o as string));
    if (!oses.length) return { error: 'Pick at least one computer.' };
  }
  let github: string | undefined;
  if (deliveryTypeOf(p) === 'repo_access') {
    github = String(i.github ?? '')
      .trim()
      .replace(/^@/, '');
    if (!GITHUB_NAME.test(github)) return { error: 'Enter your GitHub username, like octocat.' };
  }
  return {
    instant: dv === 'download' && pkg === 'asis' && deliveryTypeOf(p) === 'download',
    title: appName || p.name,
    productId: p.id,
    product: p,
    sellerId: p.sellerId,
    productDbId: p.dbId,
    lines,
    totalCents: lines.reduce((s, l) => s + l[1], 0),
    days: p.days,
    domain,
    appName,
    oses,
    github,
    express: i.express === true,
  };
}
