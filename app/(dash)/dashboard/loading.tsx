import { GlassPage } from '@/components/glass/GlassPage';

import { T } from '@/components/i18n/T';
/*
 * Shown at once when a dashboard link is clicked, while the page itself is read from the database. A page that can be a 404 (unknown id or
 * address) goes in app/(dash)/(exact)/dashboard instead: under this screen the response has already started with 200 when notFound() runs.
 */
export default function Loading() {
  return (
    <GlassPage kind="d" file="admin">
      <div role="status" aria-live="polite" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
        <p className="muted">
          <T s={'Loading…'} />
        </p>
      </div>
    </GlassPage>
  );
}
