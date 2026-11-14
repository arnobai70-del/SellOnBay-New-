import { TopBand } from '@/components/glass/TopBand';
import Link from 'next/link';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { pageCopy } from '@/lib/content/copy';
import { HUBS } from '@/lib/seo/hubs';

import { getI18n } from '@/lib/i18n/server';
/*
 * design-reference/404.html: the error card with search and the ways back; beside it the website categories. Its words come from Admin › Content ›
 * Pages ("Page not found"). The maintenance card of the same design file is components/MaintenanceNotice.tsx.
 */
export default async function NotFound() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const c = await pageCopy('not-found');
  return (
    <PublicFrame file="404">
      <TopBand eyebrow="Error 404" title={c.t('main', 'heading')} intro={c.t('main', 'text')}>
        <form action="/search" method="get" role="search" style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 520, padding: 6, borderRadius: 999, boxSizing: 'border-box' }}>
          <label htmlFor="s4" className="hidden-label">
            Search
          </label>
          <input id="s4" name="q" className="input" style={{ flex: 1, minWidth: 0 }} placeholder={tx('Search websites or domains')} />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
      </TopBand>
      <div className="grid2">
        <section className="glass card" style={{ padding: 44, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
          <div className="big" aria-hidden="true">
            404
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn ghost" href="/" prefetch={false}>
              Home
            </Link>
            <Link className="btn ghost" href="/websites" prefetch={false}>
              Browse websites
            </Link>
            <Link className="btn ghost" href="/help" prefetch={false}>
              Help center
            </Link>
          </div>
        </section>
        <section className="glass card" style={{ padding: 44, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
          <span className="tag" style={{ margin: 0, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Browse by category
          </span>
          {HUBS.map((h) => (
            <Link key={h.slug} className="btn ghost" href={`/websites/category/${h.slug}`} prefetch={false}>
              {h.name}
            </Link>
          ))}
        </section>
      </div>
    </PublicFrame>
  );
}
