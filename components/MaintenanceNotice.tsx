import Link from 'next/link';
import { MODULES, type ModuleKey } from '@/lib/maintenance/config';

/* The "Maintenance page" card of design-reference/404.html, for one closed area: what is closed, until when, and what still works. */
export function MaintenanceNotice({ module: key, message, until }: { module: ModuleKey; message: string; until: number | null }) {
  const m = MODULES[key];
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 24 }} role="status">
      <section className="glass card" style={{ padding: 44, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, maxWidth: 640 }}>
        <span className="tag" style={{ margin: 0, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          {m.label}
        </span>
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#5FA88F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
        </svg>
        <h1 style={{ fontSize: 32, fontWeight: 300 }}>We&apos;ll be right back</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {message}
        </p>
        <div className="status st-wait">Maintenance in progress</div>
        {until && (
          <div className="tag" style={{ margin: 0 }}>
            Planned to be back by <time dateTime={new Date(until).toISOString()}>{new Date(until).toUTCString().replace(/:\d\d GMT$/, ' UTC')}</time>.
          </div>
        )}
        <div className="tag" style={{ margin: 0 }}>
          Still working: {m.keeps}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn" href="/">
            Go to the home page
          </Link>
          <Link className="btn ghost" href="/help">
            Help
          </Link>
        </div>
      </section>
    </div>
  );
}
