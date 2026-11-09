/* The design's small charts (design-reference/admin.html, seller-dashboard.html), drawn as plain SVG and CSS so they cost no script. */

/* A line that draws itself in: values left to right, scaled to the box. */
export function LineChart({ values, label, height = 180 }: { values: number[]; label: string; height?: number }) {
  const w = 600;
  const top = 20;
  const bottom = height - 15;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (w - 20) / (values.length - 1) : 0;
  const points = values.map((v, i) => `${Math.round(10 + i * step)},${Math.round(bottom - (v / max) * (bottom - top))}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height, display: 'block', marginTop: 10 }} role="img" aria-label={label}>
      {[0.22, 0.55, 0.88].map((f) => (
        <line key={f} x1="0" y1={Math.round(height * f)} x2={w} y2={Math.round(height * f)} stroke="#DCE7EC" />
      ))}
      {values.length > 1 && <polyline className="draw" points={points} fill="none" stroke="#5FA88F" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}

/* A ring that fills to a share (0 to 1), with the share written in the middle. */
export function Ring({ share, label, text }: { share: number; label: string; text?: string }) {
  const s = Math.max(0, Math.min(1, share));
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={label} style={{ flex: 'none' }}>
      <circle cx="60" cy="60" r="50" fill="none" stroke="#E1EAEF" strokeWidth="12" />
      <circle
        style={{ animation: 'sob-ringfill 1.8s cubic-bezier(.2,.8,.2,1) .4s both' }}
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke="#5FA88F"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray="314"
        strokeDashoffset={Math.round(314 * (1 - s))}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="66" textAnchor="middle" fontSize="22" fill="#2B4250" fontFamily="inherit">
        {text ?? `${Math.round(s * 100)}%`}
      </text>
    </svg>
  );
}

/* A thin bar that fills to a share (0 to 1). */
export function Bar({ share, label }: { share: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, share)) * 100);
  return (
    <div className="bar" role={label ? 'img' : undefined} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/* Columns that grow up from the bottom, one per value, with a label under each. */
export function Columns({ items, label, height = 160 }: { items: { label: string; value: number; text?: string }[]; label: string; height?: number }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height, marginTop: 12 }}>
      {items.map((i) => (
        <div key={i.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
          <span className="tag" style={{ margin: 0 }}>
            {i.text ?? i.value}
          </span>
          <span
            style={{
              transformOrigin: 'bottom',
              animation: 'sob-grow 1.2s cubic-bezier(.2,.8,.2,1) .4s both',
              width: '100%',
              maxWidth: 46,
              height: `${Math.max(2, (i.value / max) * 100)}%`,
              borderRadius: '8px 8px 4px 4px',
              background: '#A9D4C5',
            }}
          />
          <span className="tag" style={{ margin: 0, whiteSpace: 'nowrap' }}>
            {i.label}
          </span>
        </div>
      ))}
    </div>
  );
}
