import type { Product } from '@/lib/data';
import { SHELVES, platformOf } from '@/lib/apps';

/* Plain glyphs on purpose: no trademarked logos on a marketplace listing. */
export function PlatformBadge({ p, className = 'app-badge' }: { p: Product; className?: string }) {
  const pl = platformOf(p);
  if (pl === 'web') return null;
  return (
    <span className={className}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {pl === 'ios' && (
          <>
            <rect x="7" y="2.5" width="10" height="19" rx="2.6" />
            <path d="M10.5 5.5h3" />
          </>
        )}
        {pl === 'android' && (
          <>
            <rect x="7" y="2.5" width="10" height="19" rx="1.6" />
            <circle cx="12" cy="5.4" r=".6" />
          </>
        )}
        {pl === 'webapp' && (
          <>
            <rect x="3" y="4.5" width="18" height="15" rx="2.4" />
            <path d="M3 9.5h18" />
            <circle cx="6.2" cy="7" r=".5" />
          </>
        )}
        {pl === 'digital' && (
          <>
            <path d="M6 3h8l4 4v14H6z" />
            <path d="M14 3v4h4" />
          </>
        )}
        {pl === 'desktop' && (
          <>
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M9 20h6M12 16v4" />
          </>
        )}
      </svg>
      {SHELVES[pl].badge}
    </span>
  );
}
