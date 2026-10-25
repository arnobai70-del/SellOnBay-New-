import Link from 'next/link';
import { FaqList } from '@/components/FaqList';
import { PageHero } from '@/components/PageHero';
import { FAQ_GROUPS } from '@/lib/faq';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/faq');

export default async function FaqPage() {
  const w = await pageWords('/faq');
  return (
    <>
      <PageHero tone="cobalt" title={w.heading} lead={w.intro ?? ''} art={false}>
        {FAQ_GROUPS.map((g) => (
          <a key={g.title} className="hero-link" href={'#' + g.title.toLowerCase().replace(/\W+/g, '-')}>
            {g.title}
          </a>
        ))}
      </PageHero>
      <div className="wrap faq-page">
        {FAQ_GROUPS.map((g) => (
          <section key={g.title} id={g.title.toLowerCase().replace(/\W+/g, '-')}>
            <h2>{g.title}</h2>
            <FaqList items={g.items} />
          </section>
        ))}
        <p className="muted faq-end">
          Still stuck?{' '}
          <Link className="link-u" href="/how-it-works">
            See how it works
          </Link>{' '}
          .
        </p>
      </div>
      <PageExtras path="/faq" />
    </>
  );
}
