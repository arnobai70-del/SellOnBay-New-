import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

/* The mark is a bay (a bowl of water) with a gold sun over it; the name is set in two weights of colour so the last word reads as the place. */
export function Logo() {
  const accent = BRAND_NAME.length > 3 ? BRAND_NAME.slice(-3) : '';
  return (
    <Link className="logo" href="/" aria-label={BRAND_NAME}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="lb-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5565FF" />
            <stop offset="1" stopColor="#2B3DFF" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#lb-mark)" />
        <path d="M7 14.5c0 5.6 4 9.5 9 9.5s9-3.9 9-9.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M11.2 17.8c1.2 1.5 2.9 2.4 4.8 2.4s3.6-.9 4.8-2.4" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16" cy="8.4" r="3" fill="#FFB52E" />
      </svg>
      <span aria-hidden="true">
        {BRAND_NAME.slice(0, BRAND_NAME.length - accent.length)}
        <b>{accent}</b>
      </span>
    </Link>
  );
}
