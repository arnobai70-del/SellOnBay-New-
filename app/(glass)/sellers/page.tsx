import Link from 'next/link';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { PLAN_KEEP_TEXT } from '@/lib/config';
import { pageCopy } from '@/lib/content/copy';
import { publicSellers } from '@/lib/glass/catalog';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = () => pageMetadata('/sellers', { alternates: { canonical: '/sellers' } });

const AV = ['#E6E2F4', '#DCEBF5', '#F1E8DD', '#DCF0E7', '#E8EEF2', '#F6E0EA'];
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'S';

/*
 * design-reference/sellers.html: everyone with a live website, SellOnBay's own store included (lib/glass/catalog.ts), searched by name or skill,
 * filtered by a skill tab and "Available for custom work". The filters are in the address, so the page works without JavaScript.
 */
export default async function Sellers({ searchParams }: { searchParams: Promise<{ q?: string; custom?: string; skill?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const { q = '', custom, skill = '' } = await searchParams;
  const [all, words, copy] = await Promise.all([publicSellers(), pageWords('/sellers'), pageCopy('sellers')]);
  const tagsOf = (s: (typeof all)[number]) => [...new Set([...s.skills, ...s.websites.map((w) => w.stack).filter((x): x is string => !!x)])];
  const counts = new Map<string, number>();
  for (const s of all) for (const t of tagsOf(s)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const skills = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t]) => t);
  const term = String(q).trim().toLowerCase();
  const list = all.filter(
    (s) => (!term || `${s.name} ${s.headline} ${tagsOf(s).join(' ')}`.toLowerCase().includes(term)) && (custom !== '1' || s.customAvailable) && (!skill || tagsOf(s).includes(skill)),
  );
  const href = (o: { skill?: string; custom?: string }) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(o.skill ? { skill: o.skill } : {}), ...(o.custom ? { custom: o.custom } : {}) });
    return `/sellers${p.size ? `?${p}` : ''}`;
  };
  return (
    <PublicFrame file="sellers">
      <header className="pagehead">
        <h1>{copy.t('head', 'heading', words.heading)}</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 600, lineHeight: 1.6 }}>
          {copy.t('head', 'intro', words.intro ?? '')}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <form
            className="glass"
            action="/sellers"
            method="get"
            role="search"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 18px', borderRadius: 999, flex: '1 1 300px', maxWidth: 440 }}
          >
            {skill && <input type="hidden" name="skill" value={skill} />}
            {custom === '1' && <input type="hidden" name="custom" value="1" />}
            <label htmlFor="ss" className="hidden-label">
              <T s={'Search sellers'} />
            </label>
            <input
              id="ss"
              name="q"
              defaultValue={q}
              placeholder={tx('Search by name or skill')}
              style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: '15px var(--font-inter)', color: '#2B4250', outline: 'none', minHeight: 42 }}
            />
            <button className="btn sm" type="submit">
              <T s={'Search'} />
            </button>
          </form>
          <div className="seg" role="tablist" aria-label={tx('Skill')}>
            <Link role="tab" className={!skill ? 'on' : ''} aria-selected={!skill} href={href({ custom })} prefetch={false}>
              <T s={'All'} />
            </Link>
            {skills.map((t) => (
              <Link key={t} role="tab" className={skill === t ? 'on' : ''} aria-selected={skill === t} href={href({ skill: t, custom })} prefetch={false}>
                {t}
              </Link>
            ))}
          </div>
          <Link className="chk" href={href({ skill, custom: custom === '1' ? undefined : '1' })} prefetch={false} role="checkbox" aria-checked={custom === '1'} style={{ textDecoration: 'none' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: 5,
                border: '1.5px solid #7FBFA9',
                background: custom === '1' ? '#5FA88F' : '#fff',
                color: '#fff',
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              {custom === '1' ? '✓' : ''}
            </span>{' '}
            <T s={'Available for custom work'} />
          </Link>
        </div>
      </header>
      {list.length ? (
        <section className="grid3">
          {list.map((s, i) => {
            const tags = tagsOf(s).slice(0, 3);
            return (
              <div key={s.key} className="glass sc">
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span className="av" style={{ background: AV[i % AV.length] }} aria-hidden="true">
                    {initials(s.name)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 17 }}>{s.name}</div>
                    <div className="tag" style={{ margin: 0 }}>
                      {s.headline || (s.verified ? 'Verified seller' : 'Seller')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 18, fontSize: 14, flexWrap: 'wrap' }}>
                  <span>
                    <b style={{ fontWeight: 500 }}>★ {s.reviews ? s.rating.toFixed(1) : 'New'}</b> <span className="muted">({s.reviews})</span>
                  </span>
                  <span>
                    {s.websites.length} {s.websites.length === 1 ? 'website' : 'websites'}
                  </span>
                  {s.replyTime && <span className="muted">{s.replyTime}</span>}
                </div>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {tags.map((t) => (
                      <span key={t} className="pill">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="row" style={{ marginTop: 4 }}>
                  <span className={s.customAvailable ? 'status st-ok' : 'status st-draft'}>{s.customAvailable ? 'Available for custom work' : 'Not taking custom work'}</span>
                  <Link className="btn sm" href={`/sellers/${s.handle}`} prefetch={false}>
                    <T s={'View store'} />
                  </Link>
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="glass card">
          <h2 style={{ fontSize: 22 }}>
            <T s={'No sellers match'} />
          </h2>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
            <T s={'Try another name or skill, or'} />{' '}
            <Link href="/sellers">
              <T s={'see every seller'} />
            </Link>
            .
          </p>
        </section>
      )}
      <section className="sec">
        <div className="glass card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 300 }}>
              <T s={'Build websites? Sell them here.'} />
            </h2>
            <div className="tag">
              <T s={'Keep {PLAN_KEEP_TEXT} of every sale'} v={{ PLAN_KEEP_TEXT }} />
            </div>
          </div>
          <Link className="btn" href="/sell">
            <T s={'Become a seller'} />
          </Link>
        </div>
      </section>
      <PageExtras path="/sellers" />
    </PublicFrame>
  );
}
