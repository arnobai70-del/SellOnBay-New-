import { BRAND_NAME } from '@/lib/brand';
import { NETWORKS, shownSocial, type SocialLink } from '@/lib/site/social';
import { SOCIAL_MARKS } from '@/lib/site/socialIcons';

/* The row of social links (owner, 2026-11-08): brand marks in one colour, the brand colour on hover, a new tab, rel "noopener me". Nothing when none is on. */
export function SocialRow({ links, label = 'Follow SellOnBay' }: { links: SocialLink[]; label?: string }) {
  const shown = shownSocial(links);
  if (!shown.length) return null;
  return (
    <ul className="sob-social" aria-label={label}>
      {shown.map((l) => {
        const m = SOCIAL_MARKS[l.network];
        const name = NETWORKS[l.network].label;
        return (
          <li key={l.network}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener me"
              aria-label={`${BRAND_NAME} on ${name}`}
              style={{ '--brand': /^(0{6}|1{6}|181717)$/i.test(m.hex) ? 'var(--g-text)' : `#${m.hex}` } as React.CSSProperties}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d={m.path} fill="currentColor" fillRule="evenodd" />
              </svg>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
