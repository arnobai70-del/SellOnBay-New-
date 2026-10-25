import Link from 'next/link';
import { fromPrice, type Dev } from '@/lib/developers';
import { DevAvatar } from './DevParts';

const POINTS: [string, string][] = [
  ['Find by stack', 'Filter by language, framework and the kind of work you need done.'],
  ['See the price first', 'Every developer lists three fixed packages. No bidding, no surprises.'],
  ['Pay safely', 'Your money waits in escrow until you accept the work.'],
  ['Know who you hire', 'Skills with levels, templates they have customised, and real reviews.'],
];

/* Same dots every time (a tiny seeded generator), so the server and the browser draw the identical picture. */
const net = (() => {
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 46 }, (_, i) => ({ x: Math.round(r() * 1200), y: Math.round(r() * 620), hot: i % 6 === 0, d: +(r() * 4).toFixed(1) }));
  const lines: [number, number, number, number][] = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 150 && lines.length < 70) lines.push([pts[i].x, pts[i].y, pts[j].x, pts[j].y]);
  return { pts, lines };
})();

/* A glowing network of people behind the headline, with a handful of real profiles floating in front. */
export function DevHero({ devs, children }: { devs: Dev[]; children: React.ReactNode }) {
  const top = [...devs]
    .filter((d) => d.avail !== 'Booked')
    .sort((a, b) => b.rating * Math.min(1, b.reviews / 80) - a.rating * Math.min(1, a.reviews / 80))
    .slice(0, 6);
  return (
    <section className="dvh">
      <svg className="dvh-net" viewBox="0 0 1200 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {net.lines.map((l, i) => (
          <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />
        ))}
        {net.pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.hot ? 4 : 2.4} className={p.hot ? 'hot' : ''} style={{ animationDelay: p.d + 's' }} />
        ))}
      </svg>
      <div className="wrap dvh-in">
        <div className="dvh-copy">
          <h1>
            Hire developers who <b>know your stack</b>
          </h1>
          <p className="lead">Pick a template, then hire someone to make it yours.</p>
          {children}
          <ul className="dvh-points">
            {POINTS.map(([t, d]) => (
              <li key={t}>
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="dvh-board" aria-label="Top rated developers">
          {top.map((d, i) => (
            <Link key={d.id} href={`/developers/${d.id}`} className="dvh-card" style={{ '--i': i } as React.CSSProperties}>
              <DevAvatar dev={d} size={42} />
              <span className="dvh-t">
                <b>{d.name}</b>
                <small>{d.langs.slice(0, 2).join(' · ')}</small>
              </span>
              <span className="dvh-m">
                <span>
                  <b className="star">★</b> {d.rating ? d.rating.toFixed(1) : 'New'}
                </span>
                <span>from ${fromPrice(d)}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
