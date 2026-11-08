import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';
import { EMAIL_ROUTES } from '@/lib/emailRouting';
import type { ContactRoutes } from '@/lib/site/contact';
import type { SocialLink } from '@/lib/site/social';
import { SocialRow } from './SocialRow';
import { FOOTER_COLUMNS, type FooterColumn } from '@/lib/glass/nav';

export function PublicFooter({ columns = FOOTER_COLUMNS, routes = EMAIL_ROUTES, social = [] }: { columns?: FooterColumn[]; routes?: ContactRoutes; social?: SocialLink[] }) {
  return (
    <footer className="g-foot">
      <div>
        <Link className="g-logo" href="/">
          <span className="g-dot" aria-hidden="true" />
          {BRAND_NAME}
        </Link>
        <p className="g-foot-p">Full-stack websites and domains, bought safely with escrow.</p>
        <SocialRow links={social} />
      </div>
      {columns.map((c) => (
        <div key={c.title} className="g-foot-c">
          <span className="g-foot-t">{c.title}</span>
          {c.links.map((l) => (
            <Link key={l.href} className="g-foot-a" href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>
      ))}
      <div className="g-foot-c">
        <span className="g-foot-t">Contact</span>
        <a className="g-foot-a" href={`mailto:${routes.support}`}>
          {routes.support}
        </a>
        <a className="g-foot-a" href={`mailto:${routes.billing}`}>
          {routes.billing}
        </a>
        <a className="g-foot-a" href={`mailto:${routes.report}`}>
          {routes.report}
        </a>
      </div>
    </footer>
  );
}
