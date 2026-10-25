/* Shown at once when a dashboard link is clicked, while the page itself is read from the database. */
export default function Loading() {
  return (
    <div className="dash" role="status" aria-live="polite" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <p className="muted">Loading…</p>
    </div>
  );
}
