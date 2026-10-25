import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvailDot, DevAvatar, LevelBadge, Stars } from '@/components/DevParts';
import { PackBox } from '@/components/PackBox';
import { findAny } from '@/lib/apps';
import { getDev } from '@/lib/devsDb';
import { creditsTrial } from '@/lib/developers';
import { getViewerId } from '@/lib/supabase/viewer';
import { examplesBuyable } from '@/lib/examples';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await getDev(id);
  return r ? { title: `${r.dev.name}: ${r.dev.gig}`, description: r.dev.headline } : { title: 'Developer not found' };
}

const MASTERY = { Expert: 100, Advanced: 72, Intermediate: 45 } as const;

export default async function DevProfile({ params }: Props) {
  const { id } = await params;
  const r = await getDev(id, await getViewerId());
  if (!r) notFound();
  const { dev: d, status } = r;
  const live = status === 'live';
  const work = d.work.map((w) => findAny(w)).filter((x) => !!x);
  return (
    <div className="wrap dv-page">
      <p className="crumbs">
        <Link href="/developers">Developers</Link> / {d.areas[0]}
      </p>
      {!live && (
        <div className="note" style={{ marginBottom: 18 }}>
          <span>Only you can see this profile. It goes public after review, usually within a day.</span>
        </div>
      )}
      <div className="dv-layout">
        <div className="dv-main">
          <h1>{d.gig}</h1>
          <div className="dv-strip">
            <DevAvatar dev={d} size={52} />
            <div>
              <b>{d.name}</b> <LevelBadge level={d.level} />
              {d.example && (
                <span className="chip amber" data-example style={{ marginLeft: 8 }}>
                  <i />
                  Example profile
                </span>
              )}
              <div className="dv-sub">
                <Stars rating={d.rating} reviews={d.reviews} />
                {d.orders > 0 && <span>{d.orders} orders done</span>}
                <AvailDot avail={d.avail} />
              </div>
            </div>
          </div>

          <div className="dv-banner" style={{ background: `linear-gradient(150deg, hsl(${d.hue} 85% 93%), hsl(${(d.hue + 30) % 360} 80% 78%))` }}>
            <span className="dv-code" aria-hidden="true">
              {'</>'}
            </span>
            <div className="dv-langs big">
              {d.langs.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>

          <section>
            <h2>About {d.name.split(' ')[0]}</h2>
            <p className="dv-bio">{d.bio}</p>
            <dl className="dv-facts">
              <div>
                <dt>From</dt>
                <dd>{d.country}</dd>
              </div>
              <div>
                <dt>On SellOnBay since</dt>
                <dd>{d.since}</dd>
              </div>
              <div>
                <dt>Replies in</dt>
                <dd>about {d.respond}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{d.level}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>Languages and skills</h2>
            <div className="dv-chips">
              {d.langs.map((l) => (
                <span key={l} className="dv-chip lang">
                  {l}
                </span>
              ))}
            </div>
            <ul className="dv-skills">
              {d.skills.map((s) => (
                <li key={s.name}>
                  <span>{s.name}</span>
                  <div className="meter">
                    <i style={{ width: MASTERY[s.level] + '%' }} />
                  </div>
                  <em>{s.level}</em>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>What I work on</h2>
            <div className="dv-chips">
              {d.areas.map((a) => (
                <Link key={a} className="dv-chip" href={`/developers?area=${encodeURIComponent(a)}`}>
                  {a}
                </Link>
              ))}
            </div>
          </section>

          {work.length > 0 && (
            <section>
              <h2>Templates I have customised</h2>
              <div className="dv-work">
                {work.map(
                  (p) =>
                    p && (
                      <Link key={p.id} href={`/product/${p.id}`} className="dv-work-i">
                        <b>{p.name}</b>
                        <span>{p.cat}</span>
                      </Link>
                    ),
                )}
              </div>
            </section>
          )}

          <section>
            <h2>Reviews {d.reviews > 0 && <small>({d.reviews})</small>}</h2>
            {d.feedback.length ? (
              d.feedback.map((f) => (
                <article key={f.by + f.when} className="dv-rev">
                  <div className="dv-rev-h">
                    <span className="av">{f.by[0]}</span>
                    <div>
                      <b>{f.by}</b>
                      <small>
                        {f.country} · {f.when}
                      </small>
                    </div>
                    <span className="star">{'★'.repeat(f.rating)}</span>
                  </div>
                  <p>{f.text}</p>
                </article>
              ))
            ) : (
              <p className="muted">No reviews yet. Every order is held in escrow, so you are covered.</p>
            )}
          </section>
        </div>
        <PackBox id={d.id} packs={d.packs} canHire={live && d.avail !== 'Booked' && !(d.example && !examplesBuyable())} example={!!d.example} creditTrial={creditsTrial(d)} trial={d.trial} />
      </div>
    </div>
  );
}
