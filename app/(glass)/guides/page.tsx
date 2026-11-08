import Link from 'next/link';
import { pageCopy } from '@/lib/content/copy';
import { GlassCard } from '@/components/glass/GlassCard';
import { PageExtras } from '@/components/PageExtras';
import { descriptionOf, publishedPosts } from '@/lib/posts';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/guides', { alternates: { canonical: '/guides' } });

export default async function Guides() {
  const [posts, words] = await Promise.all([publishedPosts(200), pageWords('/guides')]);
  const copy = await pageCopy('guides'); // Admin › Content › Pages; empty fields keep the page's own words
  return (
    <>
      <div className="g-head">
        <h1>{copy.t('head', 'heading', words.heading)}</h1>
        {copy.t('head', 'intro', words.intro ?? '') && <p className="g-lead">{copy.t('head', 'intro', words.intro ?? '')}</p>}
      </div>
      {posts.length ? (
        <div className="g-grid3">
          {posts.map((p) => (
            <GlassCard key={p.id} as="article" lift>
              <Link href={`/guides/${p.slug}`} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>
                <h2>{p.title}</h2>
                <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
                  {p.excerpt || descriptionOf(p)}
                </p>
              </Link>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard>
          <h2>New guides are on their way</h2>
        </GlassCard>
      )}
      <PageExtras path="/guides" />
    </>
  );
}
