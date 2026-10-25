import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';
import { CONFIG, REVIEW_HOURS, pct } from '@/lib/config';
import { legacyPublic } from '@/lib/legacy';
import { HUB_LINKS, hubLinkHref } from '@/lib/seo/hubLinks';
import { Logo } from './Logo';

/* The big footer: what we promise, then short columns by what a person wants to do, a call to sellers, and one line of legal links. */
type Column = { title: string; links: [label: string, href: string][] };
const LEGACY_COLUMNS: Column[] = [
  {
    title: 'Shop',
    links: [
      ['Websites', '/browse'],
      ['Android apps', '/apps/android'],
      ['iPhone & iPad apps', '/apps/ios'],
      ['Web apps', '/apps/web'],
      ['Desktop apps', '/apps/desktop'],
      ['Digital products', '/apps/digital'],
      ['All categories', '/categories'],
    ],
  },
  {
    title: 'Services',
    links: [
      ['Hire a developer', '/developers'],
      ['Find a domain', '/domains'],
      ['Find your site', '/find'],
      ['Free site ideas', '/tools/site-ideas'],
    ],
  },
  {
    title: 'Sell',
    links: [
      ['Sell on SellOnBay', '/sell'],
      ['Become a developer', '/developers/join'],
      ['Seller dashboard', '/dashboard/seller'],
      ['Seller agreement', '/seller-agreement'],
    ],
  },
  {
    title: 'Help',
    links: [
      ['How it works', '/how-it-works'],
      ['Questions and answers', '/faq'],
      ['Messages', '/messages'],
      ['Refunds', '/refunds'],
      ['Report abuse', '/report-abuse'],
      ['Copyright complaints', '/dmca'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About SellOnBay', '/welcome'],
      ['Blog', '/blog'],
      ['Acceptable use', '/acceptable-use'],
    ],
  },
];

/* The public site is the five template categories; the older columns above stay for a test server that keeps the old site (lib/legacy.ts). */
const HUB_COLUMNS: Column[] = [
  { title: 'Templates', links: HUB_LINKS.map(([slug, name]) => [name, hubLinkHref(slug)] as [string, string]) },
  {
    title: 'Sell',
    links: [
      ['Sell on SellOnBay', '/sell'],
      ['Seller dashboard', '/dashboard/seller'],
      ['Seller agreement', '/seller-agreement'],
    ],
  },
  {
    title: 'Help',
    links: [
      ['How it works', '/how-it-works'],
      ['Questions and answers', '/faq'],
      ['Messages', '/messages'],
      ['Refunds', '/refunds'],
      ['Report abuse', '/report-abuse'],
      ['Copyright complaints', '/dmca'],
    ],
  },
  { title: 'Company', links: [['Acceptable use', '/acceptable-use']] },
];
const COLUMNS = legacyPublic() ? LEGACY_COLUMNS : HUB_COLUMNS;
/* The built-in columns, as the Site builder starts from them. */
export const FOOTER_COLUMNS = COLUMNS;

const LEGAL: [label: string, href: string][] = [
  ['Terms of service', '/terms'],
  ['Privacy policy', '/privacy'],
  ['Your data', '/account/privacy'],
];

export function Footer({ columns }: { columns?: Column[] | null }) {
  const shown = columns ?? COLUMNS;
  return (
    <footer className="mk-foot">
      <div className="wrap">
        <div className="mk-foot-top">
          <div className="mk-foot-brand">
            <Logo />
            <p>
              {legacyPublic()
                ? 'A marketplace for ready-made websites, apps and digital products, and the developers who make them yours.'
                : 'A marketplace for ready-made website templates, with the source code and the files to make each one yours.'}
            </p>
            <ul className="mk-foot-trust">
              <li>Payment held in escrow until you accept</li>
              <li>{REVIEW_HOURS} hours to check what you got</li>
              <li>Domains and accounts in your name</li>
            </ul>
          </div>
          {shown.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="mk-foot-h">{c.title}</p>
              <ul>
                {c.links.map(([label, href]) => (
                  <li key={label + href}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mk-foot-sell">
          <div>
            <b>Built something people need?</b>
            <span>
              Sell it again and again. You keep {pct(10_000 - CONFIG.fees.saleBps)} of every sale from ${CONFIG.fees.saleLowBelowCents / 100}.
            </span>
          </div>
          <Link className="btn btn-gold" href="/sell">
            Start selling
          </Link>
        </div>
        <div className="mk-foot-base">
          <span>&copy; 2026 {BRAND_NAME}. All rights reserved.</span>
          <nav aria-label="Legal">
            {LEGAL.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
