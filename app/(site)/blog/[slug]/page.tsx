import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { PostBody } from '@/components/PostBody';
import { parseMarkdown } from '@/lib/markdown';
import { descriptionOf, publishedPost } from '@/lib/posts';
import { SITE_NAME, SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await publishedPost((await params).slug);
  if (!p) return { title: 'Post not found', robots: { index: false } };
  const title = p.metaTitle || p.title;
  const description = descriptionOf(p);
  const published = new Date(p.publishedAt ?? p.createdAt).toISOString();
  return {
    // A meta title is used as written, without the site name added after it.
    title: p.metaTitle ? { absolute: p.metaTitle } : p.title,
    description,
    alternates: { canonical: `/blog/${p.slug}` },
    robots: p.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/blog/${p.slug}`,
      publishedTime: published,
      modifiedTime: new Date(p.updatedAt).toISOString(),
      ...(p.coverUrl ? { images: [{ url: p.coverUrl, alt: p.coverAlt }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description, ...(p.coverUrl ? { images: [p.coverUrl] } : {}) },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await publishedPost((await params).slug);
  if (!p) notFound();
  const url = `${SITE_URL}/blog/${p.slug}`;
  const published = new Date(p.publishedAt ?? p.createdAt);
  return (
    <div className="wrap">
      <nav className="crumbs muted" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/blog">Blog</Link>
      </nav>
      <article className="post">
        <div className="page-head">
          <h1>{p.title}</h1>
          <p className="stamp muted">
            <time dateTime={published.toISOString()}>{published.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
          </p>
        </div>
        {p.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- covers come from any https address the admin gives
          <img className="post-cover" src={p.coverUrl} alt={p.coverAlt} />
        )}
        <div className="prose">
          <PostBody blocks={parseMarkdown(p.body)} />
          <p>
            <Link className="link-u" href="/blog">
              More guides
            </Link>
          </p>
        </div>
      </article>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: p.title,
          description: descriptionOf(p),
          url,
          mainEntityOfPage: url,
          datePublished: published.toISOString(),
          dateModified: new Date(p.updatedAt).toISOString(),
          ...(p.coverUrl ? { image: [p.coverUrl] } : {}),
          author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
          publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
            { '@type': 'ListItem', position: 3, name: p.title, item: url },
          ],
        }}
      />
    </div>
  );
}
