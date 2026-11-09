'use client';
import { useState } from 'react';

/*
 * "Your rating" of design-reference/buyer-websites.html: the design's .star buttons. A rating is sent to the order's review endpoint
 * (/api/demo/orders/[id]/review, the same as on the order page), which accepts it only after the order is approved, once.
 */
export function StarRating({ orderId, canRate }: { orderId: string; canRate: boolean }) {
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState(canRate ? '' : 'You can rate after approving');
  const [busy, setBusy] = useState(false);
  const rate = async (n: number) => {
    if (!canRate || busy) return;
    setBusy(true);
    const r = await fetch(`/api/demo/orders/${orderId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: n, body: '' }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok) {
      setStars(n);
      setNote('Thanks for rating');
    } else setNote(j.error ?? 'Could not save your rating. Try again.');
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: '#3D5563', marginRight: 6 }}>Your rating</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= stars ? 'star on' : 'star'} aria-label={`${n} star`} disabled={!canRate || busy || stars > 0} onClick={() => rate(n)}>
          ★
        </button>
      ))}
      {note && (
        <span className="tag" style={{ margin: '0 0 0 8px' }} role="status">
          {note}
        </span>
      )}
    </div>
  );
}
