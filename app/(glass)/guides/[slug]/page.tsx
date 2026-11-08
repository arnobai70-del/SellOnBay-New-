import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { PostBody } from '@/components/PostBody';
import { CleanHtml } from '@/components/glass/CleanHtml';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { adminOnly } from '@/lib/admin/guard';
import { publicWebsites } from '@/lib/glass/catalog';
import { cleanGuideHtml, readingMinutes } from '@/lib/guides/html';
import { parseMarkdown } from '@/lib/markdown';
import { descriptionOf, postBySlug, publishedPost, type Post } from '@/lib/posts';
import { SITE_NAME, SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

/* The live guide, or, with ?preview=1 for a Content admin, any state (drafts and scheduled guides; never indexed). */
async function load({ params, searchParams }: Params): Promise<{ p: Post; preview: boolean } | null> {
  const slug = (await params).slug;
  const live = await publishedPost(slug);
  if (live) return { p: live, preview: false };
  if ((await searchParams).preview !== '1') return null;
  const a = await adminOnly('content');
  if (!a.ok) return null;
  const p = await postBySlug(slug);
  return p ? { p, preview: true } : null;
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const r = await load(props);
  if (!r) return { title: 'Guide not found', robots: { index: false } };
  const { p, preview } = r;
  const title = p.metaTitle || p.title;
  const description = descriptionOf({ ...p, body: p.body || p.bodyHtml.replace(/<[^>]+>/g, ' ') });
  const published = new Date(p.publishedAt ?? p.createdAt).toISOString();
  const image = p.ogImage || p.coverUrl;
  return {
    // A meta title is used as written, without the site name added after it.
    title: p.metaTitle ? { absolute: p.metaTitle } : p.title,
    description,
    alternates: { canonical: p.canonical || `/guides/${p.slug}` },
    robots: p.noindex || preview ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/guides/${p.slug}`,
      publishedTime: published,
      modifiedTime: new Date(p.updatedAt).toISOString(),
      ...(image ? { images: [{ url: image, alt: p.coverAlt }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description, ...(image ? { images: [image] } : {}) },
  };
}

/* The guide's HTML, cleaned again here, with each website card replaced by the live listing (never a copy kept in the guide). */
async function GuideHtml({ html }: { html: string }) {
  const clean = cleanGuideHtml(html);
  const parts = clean.split(/<div data-type="website" data-slug="([a-z0-9-]{1,120})">[^<]*<\/div>/i);
  const sites = parts.length > 1 ? new Map((await publicWebsites()).map((p) => [p.id, p])) : new Map();
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          part.trim() && <CleanHtml key={i} html={part} />
        ) : sites.get(part) ? (
          <div key={i} className="g-guide-site">
            <WebsiteCard p={sites.get(part)!} />
          </div>
        ) : null,
      )}
    </>
  );
}

export default async function GuidePage(props: Params) {
  const r = await load(props);
  if (!r) notFound();
  const { p, preview } = r;
  const url = `${SITE_URL}/guides/${p.slug}`;
  const published = new Date(p.publishedAt ?? p.publishAt ?? p.createdAt);
  const image = p.ogImage || p.coverUrl;
  const abs = (u: string) => (u.startsWith('/') ? SITE_URL + u : u);
  return (
    <div style={{ paddingTop: 32 }}>
      {preview && (
        <p className="g-banner g-banner-warn" role="status">
          Preview: this guide is {p.status}. Only admins can see it.
        </p>
      )}
      <nav className="g-tag" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/guides">Guides</Link>
      </nav>
      <article className="post">
        <div className="g-head">
          <h1>{p.title}</h1>
          <p className="g-tag">
            <time dateTime={published.toISOString()}>{published.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
            {p.author ? ` · ${p.author}` : ''}
            {p.bodyHtml ? ` · ${readingMinutes(p.bodyHtml)} min read` : ''}
            {p.category ? ` · ${p.category}` : ''}
          </p>
        </div>
        {p.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- covers are ours (/blog/media) or any https address the admin gives
          <img className="post-cover" src={p.coverUrl} alt={p.coverAlt} loading="eager" decoding="async" />
        )}
        <div className="g-prose">
          {p.bodyHtml ? <GuideHtml html={p.bodyHtml} /> : <PostBody blocks={parseMarkdown(p.body)} />}
          {p.tags.length > 0 && <p className="g-tag">Tags: {p.tags.join(', ')}</p>}
          <p>
            <Link href="/guides">More guides</Link>
          </p>
        </div>
      </article>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: p.title,
          description: descriptionOf({ ...p, body: p.body || p.bodyHtml.replace(/<[^>]+>/g, ' ') }),
          url,
          mainEntityOfPage: p.canonical || url,
          datePublished: published.toISOString(),
          dateModified: new Date(p.updatedAt).toISOString(),
          ...(image ? { image: [abs(image)] } : {}),
          ...(p.category ? { articleSection: p.category } : {}),
          ...(p.tags.length ? { keywords: p.tags.join(', ') } : {}),
          author: p.author ? { '@type': 'Person', name: p.author } : { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
          publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
            { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/guides` },
            { '@type': 'ListItem', position: 3, name: p.title, item: url },
          ],
        }}
      />
    </div>
  );
}
