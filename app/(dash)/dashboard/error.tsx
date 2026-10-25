'use client';

/* If a dashboard page cannot be read, say so and let the person try again, instead of a blank screen. */
export default function DashError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', padding: 24, textAlign: 'center' }}>
      <div>
        <h2>This page could not load</h2>
        <p className="muted">Something went wrong while reading it. Try again. If it keeps happening, send us this code{error.digest ? `: ${error.digest}` : '.'}</p>
        <button className="btn btn-dark" type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
