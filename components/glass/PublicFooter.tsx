import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';
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
    </footer>
  );
}
