import Link from 'next/link';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { SocialRow } from '@/components/glass/SocialRow';
import { pageCopy } from '@/lib/content/copy';
import { readingMinutes } from '@/lib/guides/html';
import { descriptionOf, publishedPosts } from '@/lib/posts';
import { HUBS } from '@/lib/seo/hubs';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { savedSocial } from '@/lib/site/contentStore';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const revalidate = 300;
export const generateMetadata = () => pageMetadata('/guides', { alternates: { canonical: '/guides' } });

const COVERS = ['#D3EEE4', '#F6E0EA', '#DDEAF6', '#E1E2F6', '#F1E8DD', '#DCF0E7', '#E8EEF2'];

/*
 * design-reference/guides.html: the newest guide featured, the rest in a grid, filtered by category (Admin › Content › Guides), the website
 * categories, and a way to follow new guides. With no guide published yet, the same layout shows, with empty states in its cards.
 */
export default async function Guides({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const { topic = '' } = await searchParams;
  const [posts, words, copy, social] = await Promise.all([publishedPosts(200), pageWords('/guides'), pageCopy('guides'), savedSocial()]);
  const topics = [...new Set(posts.map((p) => p.category).filter(Boolean))];
  const shown = topic ? posts.filter((p) => p.category === topic) : posts;
  const [featured, ...rest] = shown;
  const meta = (p: (typeof posts)[number]) => `${p.category || 'Guide'} · ${readingMinutes(p.bodyHtml || p.body)} min read`;
  return (
    <PublicFrame file="guides">
      <header className="pagehead">
        <span className="badge fade-in" style={{ alignSelf: 'flex-start' }}>
          <T s={'Guides'} />
        </span>
        <h1>{copy.t('head', 'heading', words.heading)}</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 620, lineHeight: 1.6 }}>
          {copy.t('head', 'intro', words.intro ?? '')}
        </p>
        <div className="seg" role="tablist" aria-label={tx('Topic')} style={{ alignSelf: 'flex-start' }}>
          <Link role="tab" className={!topic ? 'on' : ''} aria-selected={!topic} href="/guides" prefetch={false}>
            <T s={'All'} />
          </Link>
          {topics.map((t) => (
            <Link key={t} role="tab" className={topic === t ? 'on' : ''} aria-selected={topic === t} href={`/guides?topic=${encodeURIComponent(t)}`} prefetch={false}>
              {t}
            </Link>
          ))}
        </div>
      </header>
      {featured ? (
        <Link className="glass post" href={`/guides/${featured.slug}`} prefetch={false} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, padding: 18 }}>
          <div
            className="cover"
            style={{
              flex: '1 1 380px',
              height: 240,
              background: featured.coverUrl ? `center / cover no-repeat url(${JSON.stringify(featured.coverUrl)})` : COVERS[0],
            }}
          >
            <span className="badge">
              <T s={'Featured'} />
            </span>
          </div>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
            <span className="tag" style={{ margin: 0 }}>
              {meta(featured)}
            </span>
            <h2 style={{ fontSize: 28, fontWeight: 300 }}>{featured.title}</h2>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              {featured.excerpt || descriptionOf(featured)}
            </p>
            <span className="btn ghost" style={{ alignSelf: 'flex-start' }}>
              <T s={'Read guide'} />
            </span>
          </div>
        </Link>
      ) : (
        <div className="glass post" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, padding: 18 }}>
          <div className="cover" style={{ flex: '1 1 380px', height: 240, background: COVERS[0] }}>
            <span className="badge">
              <T s={'Featured'} />
            </span>
          </div>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'Guides'} />
            </span>
            <h2 style={{ fontSize: 28, fontWeight: 300 }}>
              <T s={'The first guides are being written'} />
            </h2>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              <T s={'Practical guides on picking a website, setting it up, choosing a domain and selling your own work appear here as soon as they are published. Until then the'} />{' '}
              <Link href="/help">
                <T s={'help center'} />
              </Link>{' '}
              <T s={'answers the common questions.'} />
            </p>
          </div>
        </div>
      )}
      <section className="sec grid3" style={{ paddingTop: 28 }}>
        {rest.length ? (
          rest.map((p, i) => (
            <Link key={p.id} className="glass post" href={`/guides/${p.slug}`} prefetch={false}>
              <div className="cover" style={{ background: p.coverUrl ? `center / cover no-repeat url(${JSON.stringify(p.coverUrl)})` : COVERS[(i + 1) % COVERS.length] }} />
              <span className="tag" style={{ margin: 0 }}>
                {meta(p)}
              </span>
              <b style={{ fontWeight: 500, fontSize: 17, lineHeight: 1.35 }}>{p.title}</b>
            </Link>
          ))
        ) : (
          <div className="glass post">
            <div className="cover" style={{ background: COVERS[1] }} />
            <span className="tag" style={{ margin: 0 }}>
              <T s={'More guides'} />
            </span>
            <b style={{ fontWeight: 500, fontSize: 17, lineHeight: 1.35 }}>{posts.length ? tx('No more guides on this topic yet') : tx('No guides published yet')}</b>
          </div>
        )}
      </section>
      <section className="sec">
        <h2 style={{ fontSize: 28, marginBottom: 18 }}>
          <T s={'Browse by category'} />
        </h2>
        <div className="grid3">
          {HUBS.map((h) => (
            <Link key={h.slug} className="glass catl" href={`/websites/category/${h.slug}`} prefetch={false}>
              <span>{h.name}</span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="sec">
        <div className="glass card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 300 }}>
              <T s={'New guides as they come out'} />
            </h2>
            <div className="tag">
              <T s={'Follow SellOnBay to hear about each new guide.'} />
            </div>
          </div>
          <SocialRow links={social} label={tx('Follow SellOnBay')} />
        </div>
      </section>
      <PageExtras path="/guides" />
    </PublicFrame>
  );
}
