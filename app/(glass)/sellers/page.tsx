import { Button } from '@/components/glass/Button';
import { pageCopy } from '@/lib/content/copy';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { PageExtras } from '@/components/PageExtras';
import { PLAN_KEEP_TEXT } from '@/lib/config';
import { publicSellers } from '@/lib/glass/catalog';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/sellers', { alternates: { canonical: '/sellers' } });

export default async function Sellers({ searchParams }: { searchParams: Promise<{ q?: string; custom?: string }> }) {
  const { q = '', custom } = await searchParams;
  const [all, words] = await Promise.all([publicSellers(), pageWords('/sellers')]);
  const term = String(q).trim().toLowerCase();
  const list = all.filter((s) => (!term || `${s.name} ${s.headline} ${s.skills.join(' ')}`.toLowerCase().includes(term)) && (custom !== '1' || s.customAvailable));
  const copy = await pageCopy('sellers'); // Admin › Content › Pages; empty fields keep the page's own words
  return (
    <>
      <div className="g-head">
        <h1>{copy.t('head', 'heading', words.heading)}</h1>
        {copy.t('head', 'intro', words.intro ?? '') && <p className="g-lead">{copy.t('head', 'intro', words.intro ?? '')}</p>}
        <form className="glass g-search" action="/sellers" method="get" role="search">
          <label className="hidden-label" htmlFor="seller-q">
            Search sellers
          </label>
          <input id="seller-q" name="q" defaultValue={q} placeholder="Search by name or skill" />
          <Button type="submit">Search</Button>
        </form>
        <div>
          <Button variant="ghost" size="sm" href={custom === '1' ? '/sellers' : '/sellers?custom=1'}>
            {custom === '1' ? 'Show all sellers' : 'Available for custom work'}
          </Button>
        </div>
      </div>
      {list.length ? (
        <div className="g-grid3">
          {list.map((s) => (
            <GlassCard key={s.key} as="article">
              <h2>{s.name}</h2>
              {s.headline && <div className="tag">{s.headline}</div>}
              <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                {s.reviews > 0 ? `★ ${s.rating.toFixed(1)} (${s.reviews}) · ` : ''}
                {s.websites.length} {s.websites.length === 1 ? 'website' : 'websites'}
                {s.replyTime ? ` · ${s.replyTime}` : ''}
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <StatusPill tone={s.customAvailable ? 'ok' : 'draft'}>{s.customAvailable ? 'Available for custom work' : 'Not taking custom work'}</StatusPill>
                <Button variant="ghost" size="sm" href={`/sellers/${s.handle}`}>
                  View store
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard>
          <h2>No sellers match</h2>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Sellers appear here once they have a live website.
          </p>
        </GlassCard>
      )}
      <section className="g-sec">
        <GlassCard className="row">
          <div>
            <h2>Build websites? Sell them here.</h2>
            <div className="tag">Keep {PLAN_KEEP_TEXT} of every sale</div>
          </div>
          <Button href="/sell">Become a seller</Button>
        </GlassCard>
      </section>
      <PageExtras path="/sellers" />
    </>
  );
}
