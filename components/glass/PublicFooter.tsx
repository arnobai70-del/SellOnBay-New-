import Link from 'next/link';
import { BrandMark } from '@/components/glass/BrandMark';
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
  home = '/',
  createdBy = 'Created by',
  langSwitch = null,
}: {
  columns?: FooterColumn[];
  routes?: ContactRoutes;
  social?: SocialLink[];
  tagline?: string;
  contactTitle?: string;
  home?: string;
  createdBy?: string;
  langSwitch?: React.ReactNode;
}) {
  return (
    <footer style={{ marginTop: 72, padding: '32px 0 8px', borderTop: '1px solid #D9E5EB', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 24 }}>
      <div>
        <Link className="logo" href={home} prefetch={false}>
          <BrandMark />
          {BRAND_NAME}
        </Link>
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.6 }}>
          {tagline}
        </p>
        <SocialRow links={social} />
        {langSwitch && <div style={{ marginTop: 12 }}>{langSwitch}</div>}
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
      {/* The credit line (owner, 2026-11-12): who built and looks after the site. The address comes from lib/emailRouting.ts. */}
      <div className="muted" style={{ gridColumn: '1 / -1', fontSize: 13, paddingTop: 16, borderTop: '1px solid #E3ECF1', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span>
          © {new Date().getFullYear()} {BRAND_NAME}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {createdBy}{' '}
          <a href={`mailto:${EMAIL_ROUTES.dev}`} style={A}>
            {EMAIL_ROUTES.dev}
          </a>
        </span>
      </div>
    </footer>
  );
}
