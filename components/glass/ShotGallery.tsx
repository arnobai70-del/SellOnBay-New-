'use client';
import { useState } from 'react';

const BOX: React.CSSProperties = { height: 420, borderRadius: 16, background: '#F7FAFB', border: '1px solid #E1EBF0', overflow: 'hidden' };

/*
 * The large preview and the .shot thumbnails of design-reference/website.html. With the seller's screenshots a thumbnail shows that picture in
 * the large frame; without them the design's drawn page is shown. The full live demo opens from the buy box.
 */
export function ShotGallery({ shots, name, tint }: { shots: string[]; name: string; tint: string }) {
  const [at, setAt] = useState(0);
  if (!shots.length)
    return (
      <div className="glass" style={{ padding: 14 }}>
        <div style={{ ...BOX, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }} aria-hidden="true">
          <span className="ln" style={{ width: '30%' }} />
          <div style={{ display: 'flex', gap: 16, flex: 1 }}>
            <div style={{ width: '20%', borderRadius: 10, background: '#EAF1F4' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                {[tint, '#DDEAF6', '#F1E8DD'].map((c) => (
                  <span key={c} style={{ height: 70, borderRadius: 10, background: c }} />
                ))}
              </div>
              <div style={{ flex: 1, borderRadius: 10, background: '#F0F5F7', display: 'flex', alignItems: 'flex-end', gap: 10, padding: 16 }}>
                {['40%', '65%', '50%', '80%', '60%'].map((h, i) => (
                  <span key={i} style={{ flex: 1, height: h, borderRadius: 6, background: i % 2 ? '#C6E7DA' : '#D3EEE4' }} />
                ))}
              </div>
              <span className="ln" />
              <span className="ln s" />
            </div>
          </div>
        </div>
      </div>
    );
  return (
    <>
      <div className="glass" style={{ padding: 14 }}>
        <div style={BOX}>
          {/* eslint-disable-next-line @next/next/no-img-element -- seller screenshots are served from our own private route, in any size */}
          <img src={shots[at]} alt={`${name} screenshot ${at + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      </div>
      {shots.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {shots.slice(0, 8).map((s, i) => (
            <button key={s} className={i === at ? 'shot on' : 'shot'} type="button" aria-label={`Screenshot ${i + 1}`} aria-pressed={i === at} onClick={() => setAt(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
