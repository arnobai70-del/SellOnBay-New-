import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { PageHero } from '@/components/PageHero';
import { descriptionOf, publishedPosts } from '@/lib/posts';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { PageExtras } from '@/components/PageExtras';

export const dynamic = 'force-dynamic';
const description = `Guides on choosing, launching and growing a website, from the ${SITE_NAME} team.`;
export const generateMetadata = (): Promise<Metadata> =>
  pageMetadata('/blog', {
    alternates: { canonical: '/blog', types: { 'application/rss+xml': `${SITE_URL}/blog/feed.xml` } },
    openGraph: { title: `${SITE_NAME} blog`, description, url: '/blog' },
  });

const day = (t?: number) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export default async function Blog() {
  const [posts, w] = await Promise.all([publishedPosts(), pageWords('/blog')]);
  return (
    <>
      <PageHero tone="cobalt" title={w.heading} lead={w.intro ?? description} art={false} />
      <div className="wrap blog-list">
        {posts.length === 0 && (
          <div className="empty-note">
            <b>The first guides are on their way.</b>
            <span>
              Until then, <Link href="/how-it-works">how it works</Link> and <Link href="/faq">questions and answers</Link> cover buying, escrow and going live.
            </span>
          </div>
        )}
        {posts.map((p) => (
          <article key={p.id} className="blog-card">
            {p.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- covers come from any https address the admin gives
              <img src={p.coverUrl} alt={p.coverAlt} loading="lazy" decoding="async" />
            )}
            <div>
              <h2>
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              </h2>
              <p className="muted">
                <time dateTime={new Date(p.publishedAt ?? p.createdAt).toISOString()}>{day(p.publishedAt)}</time>
              </p>
              <p>{p.excerpt || descriptionOf(p)}</p>
            </div>
          </article>
        ))}
      </div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: `${SITE_NAME} blog`,
          url: `${SITE_URL}/blog`,
          blogPost: posts
            .slice(0, 20)
            .map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE_URL}/blog/${p.slug}`, datePublished: new Date(p.publishedAt ?? p.createdAt).toISOString() })),
        }}
      />
      <PageExtras path="/blog" />
    </>
  );
}
