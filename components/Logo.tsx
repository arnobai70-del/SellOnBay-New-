import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

/* The mark matches the favicon: a cobalt tile with a white bracket/card outline and a gold notification dot at the top-right corner. */
export function Logo() {
  const accent = BRAND_NAME.length > 3 ? BRAND_NAME.slice(-3) : '';
  return (
    <Link className="logo" href="/" aria-label={BRAND_NAME}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#2B3DFF" />
        {/* bracket / card outline — matches icon.svg exactly */}
        <path
          d="M9 11h14M9 11v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* notification badge dot */}
        <circle cx="21.5" cy="7.5" r="3.4" fill="#FFB52E" />
      </svg>
      <span aria-hidden="true">
        {BRAND_NAME.slice(0, BRAND_NAME.length - accent.length)}
        <b>{accent}</b>
      </span>
    </Link>
  );
}
