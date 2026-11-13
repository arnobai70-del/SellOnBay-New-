import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { WebsitesBrowser } from '@/components/glass/WebsitesBrowser';
import { JsonLd } from '@/components/JsonLd';
import { PageExtras } from '@/components/PageExtras';
import { categoryPath, websiteCategories } from '@/lib/glass/catalog';
import { hubPublicSlug, hubByEnding } from '@/lib/seo/hubStore';
import { hubPath } from '@/lib/seo/hubs';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { SITE_URL } from '@/lib/site';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
type Props = { params: Promise<{ category: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hub = await hubByEnding((await params).category);
  if (!hub) return { title: (await getI18n()).tx('Not found'), robots: { index: false } };
  const { alloc } = await websiteCategories();
  return pageMetadata(hubPath(hub), { alternates: { canonical: categoryPath(hubPublicSlug(hub, alloc)) } });
}

export default async function Category({ params, searchParams }: Props) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const ending = (await params).category;
  const hub = await hubByEnding(ending);
  if (!hub) notFound();
  const cats = await websiteCategories();
  const own = hubPublicSlug(hub, cats.alloc);
  if (ending !== own) permanentRedirect(categoryPath(own));
  const words = await pageWords(hubPath(hub));
  return (
    <PublicFrame file="websites">
      <header style={{ padding: '56px 0 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <nav className="tag" aria-label={tx('Breadcrumb')} style={{ margin: 0 }}>
          <Link href="/websites">
            <T s={'Websites'} />
          </Link>{' '}
          / {hub.name.replace(/ Websites$/, '')}
        </nav>
        <h1 style={{ fontSize: 40, fontWeight: 300 }}>{words.heading}</h1>
        {(words.intro ? [words.intro] : hub.intro).map((t) => (
          <p key={t} className="muted" style={{ margin: 0, maxWidth: 680, lineHeight: 1.6 }}>
            {t}
          </p>
        ))}
      </header>
      <WebsitesBrowser raw={await searchParams} category={hub.slug} />
      <section className="sec">
        <div className="glass card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>
            <T s={'What to look for'} />
          </h2>
          {hub.lookFor.map((x) => (
            <div key={x} className="tag" style={{ fontSize: 14 }}>
              ✓ {x}
            </div>
          ))}
        </div>
      </section>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Websites', item: `${SITE_URL}/websites` },
            { '@type': 'ListItem', position: 2, name: hub.name, item: SITE_URL + categoryPath(own) },
          ],
        }}
      />
      <PageExtras path={hubPath(hub)} urlPath={categoryPath(own)} name={hub.name} description={hub.description} defaultFaqs={hub.faq.map(([q, a]) => ({ q, a }))} collection />
    </PublicFrame>
  );
}
