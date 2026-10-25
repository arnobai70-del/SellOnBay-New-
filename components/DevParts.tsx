import Link from 'next/link';
import { fromPrice, initials, type Dev } from '@/lib/developers';

export function DevAvatar({ dev, size = 48 }: { dev: Pick<Dev, 'name' | 'hue'>; size?: number }) {
  return (
    <span
      className="dv-av"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${dev.hue} 80% 58%), hsl(${(dev.hue + 40) % 360} 75% 42%))` }}
      aria-hidden="true"
    >
      {initials(dev.name)}
    </span>
  );
}

export const Stars = ({ rating, reviews }: { rating: number; reviews: number }) =>
  reviews > 0 ? (
    <span className="dv-rate">
      <b className="star">★</b> <b>{rating.toFixed(1)}</b> <span>({reviews})</span>
    </span>
  ) : (
    <span className="dv-rate muted">New, no reviews yet</span>
  );

export const LevelBadge = ({ level }: { level: Dev['level'] }) => <span className={'dv-level l-' + level.replace(/\s/g, '').toLowerCase()}>{level}</span>;

const AVAIL_CLS = { 'Available now': 'ok', 'Busy for a week': 'mid', Booked: 'no' } as const;
export const AvailDot = ({ avail }: { avail: Dev['avail'] }) => (
  <span className={'dv-avail ' + AVAIL_CLS[avail]}>
    <i />
    {avail}
  </span>
);

/* Gig-style card: cover with the developer's main languages, then who, what they do, rating and price. */
export function DevCard({ dev }: { dev: Dev }) {
  return (
    <Link className="dv-card" href={`/developers/${dev.id}`}>
      <div className="dv-cover" style={{ background: `linear-gradient(150deg, hsl(${dev.hue} 85% 94%), hsl(${(dev.hue + 30) % 360} 80% 82%))` }}>
        <span className="dv-code" style={{ color: `hsl(${dev.hue} 60% 38%)` }} aria-hidden="true">
          {'</>'}
        </span>
        <div className="dv-langs">
          {dev.langs.slice(0, 3).map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <AvailDot avail={dev.avail} />
      </div>
      <div className="dv-body">
        <div className="dv-who">
          <DevAvatar dev={dev} size={34} />
          <div>
            <b>{dev.name}</b>
            <LevelBadge level={dev.level} />
          </div>
        </div>
        <h3>{dev.gig}</h3>
        {dev.example && <span className="dv-eg">Example profile</span>}
        <Stars rating={dev.rating} reviews={dev.reviews} />
        <div className="dv-foot">
          <span>{dev.country}</span>
          <span className="dv-from">
            From <b>${fromPrice(dev)}</b>
          </span>
        </div>
      </div>
    </Link>
  );
}
