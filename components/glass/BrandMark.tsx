/* The SellOnBay mark, the same as the favicon (app/icon.svg): a blue tile with a white card outline and a gold dot (owner, 2026-11-09). */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <rect width="32" height="32" rx="9" fill="#2B3DFF" />
      <path d="M9 11h14M9 11v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="21.5" cy="7.5" r="3.4" fill="#FFB52E" />
    </svg>
  );
}
