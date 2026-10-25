import Link from 'next/link';
import { PageHero } from '@/components/PageHero';
import { SolutionFinder } from '@/components/SolutionFinder';
import { getLiveDbProducts } from '@/lib/catalog';
import { PRODUCTS } from '@/lib/data';
import { showExamples } from '@/lib/examples';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/find');

export default async function Find() {
  const w = await pageWords('/find');
  return (
    <>
      <PageHero tone="violet" art={false} title={w.heading} lead={w.intro ?? ''} />
      <div className="wrap find-body">
        <SolutionFinder extra={await getLiveDbProducts()} examples={(await showExamples()) ? PRODUCTS : []} />
        <p className="muted find-alt">
          Rather look around yourself?{' '}
          <Link className="link-u" href="/browse">
            Browse all sites
          </Link>
          .
        </p>
      </div>
      <PageExtras path="/find" />
    </>
  );
}
