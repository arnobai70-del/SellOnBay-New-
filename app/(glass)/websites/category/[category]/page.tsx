import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { JsonLd } from '@/components/JsonLd';
import { PageExtras } from '@/components/PageExtras';
import { categoryPath, publicWebsites, websiteCategories } from '@/lib/glass/catalog';
import { hubPublicSlug, hubByEnding } from '@/lib/seo/hubStore';
import { hubPath } from '@/lib/seo/hubs';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hub = await hubByEnding((await params).category);
  if (!hub) return { title: 'Not found', robots: { index: false } };
  const { alloc } = await websiteCategories();
  return pageMetadata(hubPath(hub), { alternates: { canonical: categoryPath(hubPublicSlug(hub, alloc)) } });
}

export default async function Category({ params }: Props) {
  const ending = (await params).category;
  const hub = await hubByEnding(ending);
  if (!hub) notFound();
  const cats = await websiteCategories();
  const own = hubPublicSlug(hub, cats.alloc);
  if (ending !== own) permanentRedirect(categoryPath(own));
  const [sites, words] = await Promise.all([publicWebsites(), pageWords(hubPath(hub))]);
  const list = sites.filter((p) => cats.of(p)?.slug === hub.slug);
  return (
    <>
      <div className="g-head">
        <h1>{words.heading}</h1>
        {(words.intro ? [words.intro] : hub.intro).map((t) => (
          <p key={t} className="g-lead">
            {t}
          </p>
        ))}
      </div>
      {list.length ? (
        <div className="g-grid3">
          {list.map((p) => (
            <WebsiteCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <GlassCard>
          <h2>New websites are on their way</h2>
          <div style={{ marginTop: 14 }}>
            <Button variant="ghost" href="/websites">
              See every website
            </Button>
          </div>
        </GlassCard>
      )}
      <section className="g-sec">
        <GlassCard>
          <h2>What to look for</h2>
          <ul className="g-list">
            {hub.lookFor.map((x) => (
              <li key={x}>✓ {x}</li>
            ))}
          </ul>
        </GlassCard>
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
    </>
  );
}
