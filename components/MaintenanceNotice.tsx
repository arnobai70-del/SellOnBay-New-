import Link from 'next/link';
import { MODULES, type ModuleKey } from '@/lib/maintenance/config';

/* Shown in place of a page whose module is in maintenance (lib/maintenance). Calm, in the site's own shell, with ways to carry on elsewhere. */
export function MaintenanceNotice({ module: key, message, until }: { module: ModuleKey; message: string; until: number | null }) {
  const m = MODULES[key];
  return (
    <div className="wrap mn" role="status">
      <div className="mn-card">
        <h1>{m.label}: back soon</h1>
        <p className="lead">{message}</p>
        {until && (
          <p className="mn-until">
            Planned to be back by <time dateTime={new Date(until).toISOString()}>{new Date(until).toUTCString().replace(/:\d\d GMT$/, ' UTC')}</time>.
          </p>
        )}
        <h2>Still working</h2>
        <p>{m.keeps}</p>
        <div className="mn-cta">
          <Link className="btn btn-blue" href="/">
            Go to the home page
          </Link>
          <Link className="btn btn-line" href="/faq">
            Help
          </Link>
        </div>
      </div>
    </div>
  );
}
