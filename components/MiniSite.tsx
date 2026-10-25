import Image from 'next/image';
import Link from 'next/link';
import { SaveButton } from './SaveButton';
import { SHOW_LIST_PRICES } from '@/lib/config';
import { THEMES, money, daysLabel, imageFor, isNew, type Photo, type Product, type SiteImage, type ThemeKey } from '@/lib/data';

type MiniOpts = { brand?: string; h?: string; url?: string; image?: SiteImage; sizes?: string; photo?: Photo };

export function Mini({ theme, brand, h, photo }: { theme: ThemeKey } & MiniOpts) {
  const t = THEMES[theme];
  const style = { '--a': t.a, '--b': t.b, '--bg': t.bg, '--tx': t.tx, '--ac': t.ac || '#fff' } as React.CSSProperties;
  const tiles = t.v === 'v4' && !photo ? 6 : 1;
  const art = photo ? { backgroundImage: `url(${photo.src})`, backgroundSize: '250% auto', backgroundPosition: `100% ${photo.y}%` } : undefined;
  return (
    <div className={`mini ${t.v}${t.dark ? ' dark' : ''}${photo ? ' has-photo' : ''}`} style={style}>
      <div className="m-nav">
        <b>{brand || t.brand}</b>
        {t.nav.slice(0, 2).map((n) => (
          <em key={n}>{n}</em>
        ))}
        <u>{t.cta}</u>
      </div>
      <div className="m-hero">
        <div className="m-copy">
          <h4>{h || t.h}</h4>
          <p>{t.p}</p>
          <u>{t.cta}</u>
        </div>
        {Array.from({ length: tiles }, (_, i) => (
          <div className="m-art" key={i} style={art} />
        ))}
      </div>
      <div className="m-row">
        <div />
        <div />
        <div />
      </div>
    </div>
  );
}

export function Frame({ theme, brand, h, url, image, photo, sizes = '(max-width: 760px) 100vw, 380px' }: { theme: ThemeKey } & MiniOpts) {
  if (image) {
    // Portrait AI preview: shown without browser chrome, cropped from the bottom so the headline stays in view.
    return (
      <div className="frame frame-img">
        <div className="shot">
          <Image src={image.src} alt="" fill sizes={sizes} style={{ objectFit: 'cover', objectPosition: 'top' }} />
        </div>
      </div>
    );
  }
  const shown = url || THEMES[theme].brand.toLowerCase().replace(/[^a-z]/g, '') + '.com';
  return (
    <div className="frame">
      <div className="frame-bar">
        <i />
        <i />
        <i />
        <span>https://{shown}</span>
      </div>
      <div className="screen">
        <Mini theme={theme} brand={brand} h={h} photo={photo} />
      </div>
    </div>
  );
}

export function ThumbS({ theme }: { theme: ThemeKey }) {
  return (
    <div className="thumb-s">
      <div className="screen">
        <Mini theme={theme} />
      </div>
    </div>
  );
}

/* Replaces the old <span data-thumb="..."> placeholder used in dashboards */
export function Thumb({ theme }: { theme: ThemeKey }) {
  return (
    <span>
      <ThumbS theme={theme} />
    </span>
  );
}

export function ProductCard({ p }: { p: Product }) {
  return (
    <div className="pwrap">
      <Link className="pcard" href={`/product/${p.id}`}>
        <Frame theme={p.theme} image={imageFor(p.id)} />
        <div className="row">
          <h3>{p.name}</h3>
          {SHOW_LIST_PRICES && <span className="price">{money(p.price)}</span>}
        </div>
        <div className="meta">
          {p.reviews > 0 ? (
            <span>
              <span className="star">★</span> {p.rating} ({p.reviews})
            </span>
          ) : (
            <span>No reviews yet</span>
          )}
          <span>{p.example ? 'Example listing' : `by ${p.seller}`}</span>
          <span className="chip">{daysLabel(p.days)}</span>
        </div>
      </Link>
      {isNew(p) && !p.example && <span className="new-chip">New</span>}
      <SaveButton id={p.id} name={p.name} />
    </div>
  );
}
