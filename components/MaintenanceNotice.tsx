import Link from 'next/link';
import { MODULES, type ModuleKey } from '@/lib/maintenance/config';

import { T } from '@/components/i18n/T';
import { TopBand } from '@/components/glass/TopBand';
/* The "Maintenance page" card of design-reference/404.html, for one closed area: what is closed, until when, and what still works. */
export function MaintenanceNotice({ module: key, message, until }: { module: ModuleKey; message: string; until: number | null }) {
  const m = MODULES[key];
  return (
    <div role="status">
      <TopBand eyebrow={m.label} title={<T s={"We'll be right back"} />} intro={message} />
      <section className="glass card" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, maxWidth: 640 }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5FA88F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
        </svg>
        <div className="status st-wait">
          <T s={'Maintenance in progress'} />
        </div>
        {until && (
          <div className="tag" style={{ margin: 0 }}>
            <T s={'Planned to be back by'} /> <time dateTime={new Date(until).toISOString()}>{new Date(until).toUTCString().replace(/:\d\d GMT$/, ' UTC')}</time>.
          </div>
        )}
        <div className="tag" style={{ margin: 0 }}>
          <T s={'Still working: {keeps}'} v={{ keeps: m.keeps }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn" href="/">
            <T s={'Go to the home page'} />
          </Link>
          <Link className="btn ghost" href="/help">
            <T s={'Help'} />
          </Link>
        </div>
      </section>
    </div>
  );
}
