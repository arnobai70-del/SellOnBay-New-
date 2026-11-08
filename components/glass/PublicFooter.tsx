import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';
import { EMAIL_ROUTES } from '@/lib/emailRouting';
import type { ContactRoutes } from '@/lib/site/contact';
import type { SocialLink } from '@/lib/site/social';
import { SocialRow } from './SocialRow';
import { FOOTER_COLUMNS, type FooterColumn } from '@/lib/glass/nav';

const COL: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 };
const A: React.CSSProperties = { color: '#3D5563', textDecoration: 'none' };

/* The footer of design-reference/*.html, with the owner's contact addresses and social links (Admin › Contact & social) added. */
export function PublicFooter({
  columns = FOOTER_COLUMNS,
  routes = EMAIL_ROUTES,
  social = [],
  tagline = 'Full-stack websites and domains, bought safely with escrow.',
  contactTitle = 'Contact',
}: {
  columns?: FooterColumn[];
  routes?: ContactRoutes;
  social?: SocialLink[];
  tagline?: string;
  contactTitle?: string;
}) {
  return (
    <footer style={{ marginTop: 72, padding: '32px 0 8px', borderTop: '1px solid #D9E5EB', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 24 }}>
      <div>
        <Link className="logo" href="/" prefetch={false}>
          <span className="dot" aria-hidden="true" />
          {BRAND_NAME}
        </Link>
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.6 }}>
          {tagline}
        </p>
        <SocialRow links={social} />
      </div>
      {columns.map((c) => (
        <div key={c.title} style={COL}>
          <b style={{ fontWeight: 500 }}>{c.title}</b>
          {c.links.map((l) => (
            <Link key={l.href} href={l.href} style={A} prefetch={false}>
              {l.label}
            </Link>
          ))}
        </div>
      ))}
      <div style={COL}>
        <b style={{ fontWeight: 500 }}>{contactTitle}</b>
        <a href={`mailto:${routes.support}`} style={A}>
          {routes.support}
        </a>
        <a href={`mailto:${routes.billing}`} style={A}>
          {routes.billing}
        </a>
        <a href={`mailto:${routes.report}`} style={A}>
          {routes.report}
        </a>
      </div>
    </footer>
  );
}
