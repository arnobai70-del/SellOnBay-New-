import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';
import { EMAIL_ROUTES } from '@/lib/emailRouting';
import { FOOTER_COLUMNS, type FooterColumn } from '@/lib/glass/nav';

export function PublicFooter({ columns = FOOTER_COLUMNS }: { columns?: FooterColumn[] }) {
  return (
    <footer className="g-foot">
      <div>
        <Link className="g-logo" href="/">
          <span className="g-dot" aria-hidden="true" />
          {BRAND_NAME}
        </Link>
        <p className="g-foot-p">Full-stack websites and domains, bought safely with escrow.</p>
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
        <a className="g-foot-a" href={`mailto:${EMAIL_ROUTES.support}`}>
          {EMAIL_ROUTES.support}
        </a>
        <a className="g-foot-a" href={`mailto:${EMAIL_ROUTES.billing}`}>
          {EMAIL_ROUTES.billing}
        </a>
        <a className="g-foot-a" href={`mailto:${EMAIL_ROUTES.report}`}>
          {EMAIL_ROUTES.report}
        </a>
      </div>
    </footer>
  );
}
