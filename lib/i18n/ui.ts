import type { FooterColumn, NavLink } from '../glass/nav';
import { localizedPath } from './config';

/*
 * The public menus in a language (owner, 2026-11-12), pure and tested: words from the catalogue, addresses with the language prefix for public
 * pages (others keep theirs). The English menus in lib/glass/nav.ts stay the one list of links.
 */
const LINK_KEYS: Record<string, string> = {
  '/websites': 'nav.websites',
  '/domains': 'nav.domains',
  '/sellers': 'nav.sellers',
  '/guides': 'footer.guides',
  '/sell': 'footer.sellOn',
  '/affiliates': 'footer.affiliate',
  '/legal/seller-agreement': 'footer.sellerAgreement',
  '/dashboard/seller': 'footer.sellerDashboard',
  '/help': 'footer.helpCenter',
  '/buyer-protection': 'footer.buyerProtection',
  '/help#contact': 'footer.contactUs',
  '/legal/terms': 'footer.terms',
  '/legal/privacy': 'footer.privacy',
  '/legal/refunds': 'footer.refunds',
  '/legal/licenses': 'footer.licenses',
};
const NAV_KEYS: Record<string, string> = {
  '/websites': 'nav.websites',
  '/domains': 'nav.domains',
  '/sellers': 'nav.sellers',
  '/sell': 'nav.sell',
  '/affiliates': 'nav.affiliate',
  '/help': 'nav.help',
};
const COLUMN_KEYS: Record<string, string> = { Marketplace: 'footer.marketplace', Sell: 'footer.sell', Help: 'footer.help', Legal: 'footer.legal' };

type T = (key: string) => string;
const href = (h: string, lang: string) => {
  const [path, hash] = h.split('#');
  return localizedPath(path, lang) + (hash ? `#${hash}` : '');
};
/* A label in the language; a key the catalogue does not know keeps the English label. */
const word = (t: T, key: string | undefined, english: string) => {
  if (!key) return english;
  const v = t(key);
  return v === key ? english : v;
};

export const localizeNav = (links: NavLink[], t: T, lang: string, label?: (l: NavLink) => string): NavLink[] =>
  links.map((l) => ({ href: href(l.href, lang), label: lang === 'en' && label ? label(l) : word(t, NAV_KEYS[l.href], label ? label(l) : l.label) }));

export const localizeFooter = (columns: FooterColumn[], t: T, lang: string): FooterColumn[] =>
  columns.map((c) => ({
    title: word(t, COLUMN_KEYS[c.title], c.title),
    links: c.links.map((l) => ({ href: href(l.href, lang), label: word(t, LINK_KEYS[l.href], l.label) })),
  }));
