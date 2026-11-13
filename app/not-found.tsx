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
      <div className="grid2" style={{ paddingTop: 56 }}>
        <section className="glass card" style={{ padding: 44, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
          <span className="tag" style={{ margin: 0, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Error 404
          </span>
          <div className="big" aria-hidden="true">
            404
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 300 }}>{c.t('main', 'heading')}</h1>
          <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
            {c.t('main', 'text')}
          </p>
          <form action="/search" method="get" role="search" style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 420 }}>
            <label htmlFor="s4" className="hidden-label">
              Search
            </label>
            <input id="s4" name="q" className="input" placeholder={tx('Search websites or domains')} />
            <button className="btn" type="submit">
              Search
            </button>
          </form>
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
