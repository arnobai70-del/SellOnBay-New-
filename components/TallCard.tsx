import Image from 'next/image';
import Link from 'next/link';
import { daysLabel, doesFeature, imageFor, isNew, money, type Product } from '@/lib/data';
import { APP_FEATURES, FEATURES, SHELVES, isApp, platformOf } from '@/lib/apps';
import { SHOW_LIST_PRICES } from '@/lib/config';
import { AppArt } from './AppPhone';
import { PlatformBadge } from './PlatformBadge';
import { SaveButton } from './SaveButton';
import { Tilt } from './Tilt';
import { ScaledPage } from './ScaledPage';
import { TemplatePage } from './TemplatePage';

export type Compare = { on: boolean; full: boolean; toggle: () => void };

/* Tall site card: the page glides down on hover, badges say what it does, and "View details" appears. */
export function TallCard({ p, compare, href }: { p: Product; compare?: Compare; href?: string }) {
  const app = isApp(p);
  const img = app ? undefined : imageFor(p.id);
  const feats = [...FEATURES, ...APP_FEATURES].filter((f) => doesFeature(p, f.key)).slice(0, 2);
  const shot = p.shots?.[0];
  return (
    <Tilt className="tilt-tall" max={5}>
      <div className="pwrap tall">
        <Link className="pcard" href={href ?? `/product/${p.id}`}>
          <div
            className={'tc-shot' + (app ? ' app-shot' : '') + (app && SHELVES[platformOf(p) as Exclude<ReturnType<typeof platformOf>, 'web'>].delivery !== 'store' ? ' wide' : '')}
            style={app && p.app ? { background: `linear-gradient(165deg, ${p.app.accent}33, ${p.app.bg})` } : undefined}
          >
            {app ? (
              shot ? (
                <span className="ap-real">
                  <Image src={shot} alt="" fill sizes="200px" unoptimized style={{ objectFit: 'cover', objectPosition: 'top' }} />
                </span>
              ) : (
                <AppArt p={p} />
              )
            ) : shot ? (
              <Image className="tc-img" src={shot} alt="" fill sizes="(max-width: 760px) 100vw, 380px" unoptimized style={{ objectFit: 'cover', objectPosition: '50% 0%' }} />
            ) : img ? (
              <Image className="tc-img" src={img.src} alt="" fill sizes="(max-width: 760px) 100vw, 380px" style={{ objectFit: 'cover', objectPosition: '50% 0%' }} />
            ) : (
              <div className="tc-pan" aria-hidden="true">
                <ScaledPage>
                  <TemplatePage p={p} />
                </ScaledPage>
              </div>
            )}
            <div className="tc-badges">
              {p.example && <span className="tc-b ex">Example</span>}
              {isNew(p) && !p.example && <span className="tc-b new">New</span>}
              {p.platform === 'digital' && (p.sample || (p.demo?.type === 'url' && /^https:/.test(p.demo.src))) && <span className="tc-b">Demo included</span>}
              {feats.map((f) => (
                <span key={f.key} className="tc-b">
                  {f.label}
                </span>
              ))}
            </div>
            <PlatformBadge p={p} />
            <span className="tc-view">View details</span>
          </div>
          <div className="row">
            <h3>{p.name}</h3>
            {SHOW_LIST_PRICES && <span className="price">{money(p.price)}</span>}
          </div>
          <div className="meta">
            <span>{app ? `${p.cat} · ${p.stack ?? 'App'}` : `in ${p.cat}`}</span>
            {p.reviews > 0 ? (
              <span>
                <span className="star">★</span> {p.rating} ({p.reviews})
              </span>
            ) : (
              <span>No reviews yet</span>
            )}
            <span className="chip">{daysLabel(p.days)}</span>
          </div>
        </Link>
        <SaveButton id={p.id} name={p.name} />
        {compare && (
          <button
            type="button"
            className="cmp"
            aria-pressed={compare.on}
            disabled={!compare.on && compare.full}
            onClick={compare.toggle}
            title={!compare.on && compare.full ? 'You can compare up to 3 sites' : undefined}
          >
            <i aria-hidden="true" />
            {compare.on ? 'Comparing' : 'Compare'}
          </button>
        )}
      </div>
    </Tilt>
  );
}
