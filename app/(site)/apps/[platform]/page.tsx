import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BrowseClient, type Initial } from '@/components/BrowseClient';
import { ShelfGuide } from '@/components/ShelfGuide';
import { SHELVES, SLUG_TO_PLATFORM, appsFor, topicFor } from '@/lib/apps';
import { getLiveDbProducts } from '@/lib/catalog';
import { showExamples } from '@/lib/examples';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { topicPath } from '@/lib/seo/pageList';
import { PageExtras } from '@/components/PageExtras';

type Props = { params: Promise<{ platform: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const DESC = {
  android: 'Ready-made Android apps, rebranded and published to your own Google Play account in 1 to 7 days.',
  ios: 'Ready-made iPhone and iPad apps, rebranded and sent to your own App Store account in 1 to 7 days.',
  webapp: 'Ready-made web apps, rebranded and deployed on your own domain in 1 to 7 days.',
  desktop: 'Ready-made desktop apps for Windows, Mac and Linux, rebranded and sent as installers in 1 to 7 days.',
  digital:
    'AI tools, video templates, stock video, audio, graphics, design templates, photos, 3D models, fonts, plugins and scripts. Files right after payment, money held in escrow until you accept.',
} as const;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const pl = SLUG_TO_PLATFORM[(await params).platform];
  // A topic of the digital shelf (?topic=audio) is its own page in search, with its own words and address.
  const t = pl === 'digital' ? topicFor(String((await searchParams).topic ?? '')) : undefined;
  if (t) return pageMetadata(topicPath(t.key), { alternates: { canonical: topicPath(t.key) } });
  return pl ? pageMetadata(`/apps/${SHELVES[pl].slug}`, { title: SHELVES[pl].label, description: DESC[pl] }) : {};
}

/* Seller apps depend on the database, so this shelf renders per request like the website one. */
export const dynamic = 'force-dynamic';

export default async function Apps({ params, searchParams }: Props) {
  const pl = SLUG_TO_PLATFORM[(await params).platform];
  if (!pl) notFound();
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const topic = pl === 'digital' ? topicFor(String(one('topic') ?? '')) : undefined;
  const extrasPath = topic ? topicPath(topic.key) : `/apps/${SHELVES[pl].slug}`;
  const initial: Initial = {
    cat: one('cat'),
    q: one('q'),
    feat: one('feat'),
    min: one('min'),
    max: one('max'),
    days: one('days'),
    rating: one('rating'),
    sort: one('sort'),
    saved: one('saved'),
    topic: one('topic'),
  };
  // A search from the top bar lands here again with new words: the key starts the list over with them.
  return (
    <>
      <BrowseClient
        key={`${initial.topic ?? ''}|${initial.q ?? ''}|${initial.cat ?? ''}|${initial.saved ?? ''}`}
        initial={initial}
        items={[...(await getLiveDbProducts(pl)), ...((await showExamples()) ? appsFor(pl) : [])]}
        kind={pl}
      />
      <ShelfGuide kind={pl} />
      <PageExtras path={extrasPath} />
    </>
  );
}
