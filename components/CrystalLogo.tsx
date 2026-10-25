/* A faceted glass "L" that floats, catches light and twinkles. Pure SVG + CSS, no JavaScript. */
const L_PATH = 'M46 22 H98 V140 H176 V196 H46 Z';

const Star = ({ x, y, s, d }: { x: number; y: number; s: number; d: string }) => (
  <path
    className="cl-star"
    style={{ animationDelay: d, transformOrigin: `${x}px ${y}px` }}
    d={`M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z`}
    fill="#fff"
  />
);

export function CrystalLogo() {
  return (
    <div className="cl" role="img" aria-label="SellOnBay crystal L logo">
      <div className="cl-glow" aria-hidden="true" />
      <svg viewBox="0 0 240 260" className="cl-svg" aria-hidden="true">
        <defs>
          <linearGradient id="cl-ice" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".5" stopColor="#ECEEF6" />
            <stop offset="1" stopColor="#C4C9DB" />
          </linearGradient>
          <linearGradient id="cl-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="cl-clip">
            <path d={L_PATH} />
          </clipPath>
          <filter id="cl-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        <ellipse className="cl-shadow" cx="112" cy="232" rx="78" ry="10" fill="#0F1330" opacity=".3" filter="url(#cl-soft)" />

        <g className="cl-float">
          <path d={L_PATH} fill="url(#cl-ice)" />
          <g clipPath="url(#cl-clip)">
            <polygon points="46,22 98,22 46,126" fill="#fff" opacity=".55" />
            <polygon points="98,22 98,140 46,196" fill="#fff" opacity=".16" />
            <polygon points="46,126 98,140 46,196" fill="#0F1330" opacity=".16" />
            <polygon points="98,140 176,140 120,196" fill="#fff" opacity=".4" />
            <polygon points="46,196 120,196 98,140" fill="#0F1330" opacity=".2" />
            <polygon points="150,140 176,140 176,196 150,196" fill="#0F1330" opacity=".85" />
            <polygon points="150,140 176,140 163,168" fill="#fff" opacity=".45" />
            <polygon points="46,22 70,22 70,196 46,196" fill="#fff" opacity=".22" />
            <rect className="cl-shine" x="-60" y="0" width="46" height="260" fill="url(#cl-sweep)" transform="skewX(-18)" />
          </g>
          <path d={L_PATH} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" opacity=".95" />
          <path d="M58 34 H86 V152 H164 V184 H58 Z" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" opacity=".5" />
          <path d="M46 22 L58 34 M98 22 L86 34 M98 140 L86 152 M176 140 L164 152 M176 196 L164 184 M46 196 L58 184" stroke="#fff" strokeWidth="1.2" opacity=".55" />
        </g>

        <Star x={30} y={64} s={9} d="0s" />
        <Star x={208} y={96} s={12} d=".9s" />
        <Star x={196} y={206} s={7} d="1.6s" />
        <Star x={116} y={10} s={7} d="2.2s" />
        <Star x={20} y={190} s={6} d="1.2s" />
      </svg>
    </div>
  );
}
