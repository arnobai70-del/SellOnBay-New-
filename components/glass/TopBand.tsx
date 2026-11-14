/*
 * The "Deep ocean" top band (owner, 2026-11-14, option C of the hero canvas): ONE dark band at the top of every public page, covering the
 * header and that page's title area only (breadcrumb, eyebrow, H1, one intro line, and the page's main control such as its search box).
 * Nothing else goes inside: no cards, lists, tables, forms or filters. Dashboards never use it.
 *
 * Its background (app/sob-parts.css, "Deep ocean top band") reaches up behind the header to the top of the page, where .page clips it, and out
 * to 24px from the window's edges (12px on phones). Pure CSS: the two glows drift on transform only, still for reduced motion; no JavaScript, no
 * scroll listener. The header turns dark while it sits on a band (.page:has(.sob-band)); it is not sticky, so it scrolls away with the band.
 * Everything inside is visible at first paint (the design's fade-ins are switched off in the band).
 *
 * No hooks and no server code, so server pages and client components (sign in, cart) render it alike.
 */
export function TopBand({
  title,
  eyebrow,
  intro,
  crumbs,
  size = 'page',
  align = 'start',
  titleId,
  children,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  intro?: React.ReactNode;
  crumbs?: React.ReactNode; // the page's own breadcrumb <nav>, drawn in the band's colours
  size?: 'home' | 'page';
  align?: 'start' | 'center';
  titleId?: string;
  children?: React.ReactNode; // the page's main control (its search box, toggle, chips or a button row)
}) {
  return (
    <header className={`sob-band sob-band-${size}`} data-align={align}>
      <div className="sob-band-bg" aria-hidden="true">
        <span className="sob-band-g1" />
        <span className="sob-band-g2" />
      </div>
      {crumbs && <div className="sob-band-crumbs">{crumbs}</div>}
      {eyebrow && <span className="sob-band-eyebrow">{eyebrow}</span>}
      <h1 className="sob-band-h1" id={titleId}>
        {title}
      </h1>
      {intro && <p className="sob-band-intro">{intro}</p>}
      {children && <div className="sob-band-ctl">{children}</div>}
    </header>
  );
}

/* The one word of a heading the design emphasises, in mint. Home: "website" and "domain"; other pages at most one word. */
export function Mint({ children }: { children: React.ReactNode }) {
  return <em className="sob-band-mint">{children}</em>;
}
