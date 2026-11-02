import Image from 'next/image';
import Link from 'next/link';
import { AppArt } from '@/components/AppPhone';
import { SaveButton } from '@/components/SaveButton';
import { ScaledPage } from '@/components/ScaledPage';
import { TemplatePage } from '@/components/TemplatePage';
import { SHELVES, isApp, platformOf, shelfLabel, type AppPlatform } from '@/lib/apps';
import { SHOW_LIST_PRICES } from '@/lib/config';
import { daysLabel, imageFor, isNew, money, type Product } from '@/lib/data';

const CARD_SIZES = '(max-width: 480px) 86vw, (max-width: 780px) 46vw, (max-width: 1060px) 31vw, 300px';

/* A big picture of the product, the same one the browse cards use: the site's own page, the app on a phone or in a window, or the files of a digital product. */
export function Cover({ p, sizes = CARD_SIZES, badges = false, alt = p.name }: { p: Product; sizes?: string; badges?: boolean; alt?: string }) {
  const app = isApp(p);
  const img = app ? undefined : imageFor(p.id);
  const shot = p.shots?.[0];
  const wide = app && SHELVES[platformOf(p) as AppPlatform].delivery !== 'store';
  return (
    <span
      className={'tc-shot ex-cover' + (app ? ' app-shot' : '') + (wide ? ' wide' : '')}
      style={app && p.app ? { background: `linear-gradient(165deg, ${p.app.accent}33, ${p.app.bg})` } : undefined}
    >
      {app ? (
        shot ? (
          <span className="ap-real">
            <Image src={shot} alt={alt} fill sizes="200px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
          </span>
        ) : (
          <AppArt p={p} />
        )
      ) : shot ? (
        <Image className="tc-img" src={shot} alt={alt} fill sizes={sizes} style={{ objectFit: 'cover', objectPosition: '50% 0%' }} />
      ) : img ? (
        <Image className="tc-img" src={img.src} alt={alt} fill sizes={sizes} style={{ objectFit: 'cover', objectPosition: '50% 0%' }} />
      ) : (
        <span className="tc-pan" aria-hidden="true">
          <ScaledPage>
            <TemplatePage p={p} />
          </ScaledPage>
        </span>
      )}
      {badges && app && <span className="ex-plat">{shelfLabel(platformOf(p))}</span>}
      {badges && (p.example ? <span className="ex-new ex-eg">Example</span> : isNew(p) && <span className="ex-new">New</span>)}
    </span>
  );
}

/* One product card on the home page: lifts on hover, the picture scrolls like a live preview, the heart keeps the saved-sites list. */
export function HomeCard({ p, href, d = 0 }: { p: Product; href?: string; d?: number }) {
  return (
    <div className="pwrap ex-card hc" style={{ '--d': d } as React.CSSProperties}>
      <Link href={href ?? `/product/${p.id}`} className="ex-card-in hc-in">
        <span className="hc-thumb">
          <Cover p={p} badges />
          <span className="hc-live" aria-hidden="true">
            Live demo
          </span>
        </span>
        <h3 className="ex-name">{p.name}</h3>
        <span className="ex-sub">{p.tag}</span>
        {p.reviews > 0 && (
          <span className="ex-rate">
            <span className="star">★</span> {p.rating} ({p.reviews})
          </span>
        )}
        <span className="ex-foot">
          {SHOW_LIST_PRICES && <span className="ex-price">{money(p.price)}</span>}
          <span className="chip">{daysLabel(p.days, p.hours)}</span>
        </span>
      </Link>
      <SaveButton id={p.id} name={p.name} />
    </div>
  );
}
