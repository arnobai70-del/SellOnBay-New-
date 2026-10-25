import { BrowseClient, type Initial } from '@/components/BrowseClient';
import { ShelfGuide } from '@/components/ShelfGuide';
import { getLiveDbProducts } from '@/lib/catalog';
import { showExamples } from '@/lib/examples';
import { PRODUCTS } from '@/lib/data';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/browse');

export default async function Browse({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
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
    domain: one('domain'),
  };
  // A search from the top bar lands here again with new words: the key starts the list over with them.
  return (
    <>
      <BrowseClient
        key={`${initial.q ?? ''}|${initial.cat ?? ''}|${initial.saved ?? ''}`}
        initial={initial}
        items={[...(await getLiveDbProducts('web')), ...((await showExamples()) ? PRODUCTS : [])]}
        kind="web"
      />
      <ShelfGuide kind="web" />
      <PageExtras path="/browse" />
    </>
  );
}
