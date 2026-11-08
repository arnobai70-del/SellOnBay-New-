'use client';
import { GlassPage } from '@/components/glass/GlassPage';

/* If a dashboard page cannot be read, say so and let the person try again, instead of a blank screen. In the design's glass card. */
export default function DashError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <GlassPage kind="d" file="admin">
      <div role="alert" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh', padding: 24, textAlign: 'center' }}>
        <section className="glass card" style={{ maxWidth: 480 }}>
          <h2>This page could not load</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            Something went wrong while reading it. Try again. If it keeps happening, send us this code{error.digest ? `: ${error.digest}` : '.'}
          </p>
          <button className="btn" type="button" onClick={reset}>
            Try again
          </button>
        </section>
      </div>
    </GlassPage>
  );
}
