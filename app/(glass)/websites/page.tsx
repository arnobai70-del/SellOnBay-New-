import Link from 'next/link';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { SearchBox } from '@/components/glass/SearchBox';
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
        {/* suggests while typing (SearchBox, owner 2026-11-14); a GET form without JavaScript */}
        <SearchBox
          variant="pill"
          inputId="s"
          action="/websites"
          defaultValue={q}
          label={tx('Search websites')}
          placeholder={tx('Search full-stack websites…')}
          hidden={typeof raw.category === 'string' && raw.category ? { category: raw.category } : {}}
        />
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
