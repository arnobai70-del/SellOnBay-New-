import Link from 'next/link';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { WebsitesBrowser } from '@/components/glass/WebsitesBrowser';
import { pageCopy } from '@/lib/content/copy';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = () => pageMetadata('/websites', { alternates: { canonical: '/websites' } });

/*
 * design-reference/websites.html: the heading and search (the site's smart search ranks the words), then the browser with its filters. A domain
 * chosen on /domains comes along (?domain=): the buyer adds it at checkout.
 */
export default async function Websites({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const raw = await searchParams;
  const [words, copy] = await Promise.all([pageWords('/websites'), pageCopy('websites')]);
  const q = typeof raw.q === 'string' ? raw.q.slice(0, 100) : '';
  const domain = typeof raw.domain === 'string' ? raw.domain.replace(/[^a-z0-9.-]/gi, '').slice(0, 80) : '';
  return (
    <PublicFrame file="websites">
      <header style={{ padding: '56px 0 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 style={{ fontSize: 40, fontWeight: 300 }}>{copy.t('head', 'heading', words.heading)}</h1>
        <form action="/websites" method="get" role="search" className="glass" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 8px 8px 20px', borderRadius: 999 }}>
          {typeof raw.category === 'string' && raw.category && <input type="hidden" name="category" value={raw.category} />}
          <label htmlFor="s" className="hidden-label">
            <T s={'Search websites'} />
          </label>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#566C78" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="s"
            name="q"
            defaultValue={q}
            placeholder={tx('Search full-stack websites…')}
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: '15px var(--font-inter)', color: '#2B4250', outline: 'none', minHeight: 44 }}
          />{' '}
          <button className="btn" type="submit">
            <T s={'Search'} />
          </button>
        </form>
        {domain && (
          <div className="tag" role="status" style={{ margin: 0 }}>
            <T s={'Pick a website for'} /> <b style={{ fontWeight: 500 }}>{domain}</b>
            <T s={': you add the domain when you request it.'} />{' '}
            <Link href="/domains">
              <T s={'Change the domain'} />
            </Link>
          </div>
        )}
      </header>
      <WebsitesBrowser raw={raw} />
      <PageExtras path="/websites" />
    </PublicFrame>
  );
}
