import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { SiteIdeasTool } from '@/components/SiteIdeasTool';
import { CONFIG } from '@/lib/config';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { SITE_URL } from '@/lib/site';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('/tools/site-ideas', { alternates: { canonical: '/tools/site-ideas' } });

const FAQ: [string, string][] = [
  ['Is it really free?', `Yes. You get ${CONFIG.ai.freeRunsPerDay} free runs a day without signing up. The same idea twice gives the same answer and does not use a run.`],
  ['Does it tell me if a domain name is free?', 'Not yet. Suggested domain names are unchecked examples. The domain ideas page does not verify real availability without a connected registrar.'],
  ['Do I have to buy a site from you?', 'No. The ideas are yours to use anywhere. If a ready-made site fits, we show you a few, live on your own domain in 1 to 7 days.'],
  ['What do you do with what I type?', 'We use it to make your answer and keep it for 30 days so the same question is not paid for twice. Please do not type personal details.'],
];

export default async function SiteIdeas() {
  const w = await pageWords('/tools/site-ideas');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  return (
    <div className="wrap">
      <JsonLd data={{ ...jsonLd, url: `${SITE_URL}/tools/site-ideas` }} />
      <div className="page-head">
        <h1>{w.heading}</h1>
        <p>{w.intro}</p>
      </div>
      <SiteIdeasTool />
      <div className="prose" style={{ marginTop: 40, paddingBottom: 80 }}>
        <h2>How it helps</h2>
        <p>
          Most small business sites need the same few things: say what you do, show what it costs, and make it easy to get in touch. The pages we suggest follow what works for the kind of business you
          describe. The domain names are short, easy to say and easy to spell.
        </p>
        <h2>Examples</h2>
        <ul>
          <li>A bakery in Dhaka that sells cakes and bread: a menu page, online ordering or booking, a catering page.</li>
          <li>A photographer who shoots weddings: a gallery of your best eight pieces, a hire-me page with prices, a short story about you.</li>
          <li>A dentist with two chairs: appointment booking, a team and services page, patient reviews.</li>
        </ul>
        <h2>Questions</h2>
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <h3>{q}</h3>
            <p>{a}</p>
          </div>
        ))}
        <p>
          Ready to go further? <Link href="/browse">Browse ready-made sites</Link> or <Link href="/find">answer three questions and we will pick for you</Link>.
        </p>
      </div>
      <PageExtras path="/tools/site-ideas" />
    </div>
  );
}
