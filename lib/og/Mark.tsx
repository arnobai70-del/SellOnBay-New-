/* The blue SellOnBay mark (as app/icon.svg) for the share pictures drawn with next/og. */
export function Mark({ px = 72 }: { px?: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="9" fill="#2B3DFF" />
      <path d="M9 11h14M9 11v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="21.5" cy="7.5" r="3.4" fill="#FFB52E" />
    </svg>
  );
}
