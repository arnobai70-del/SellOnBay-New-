'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="center-page">
      <div>
        <h1>Something went wrong</h1>
        <p>It is on our side. Try again, and if it keeps happening, report it from the footer.</p>
        <button className="btn btn-blue btn-lg" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
