import { SiteNavByPath } from '@/components/SiteNavByPath';
import { EarlyBar } from '@/components/EarlyBar';
import { Footer } from '@/components/Footer';
import { VisitTracker } from '@/components/VisitTracker';
import { TawkChat } from '@/components/TawkChat';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import { navMenu } from '@/lib/seo/navStore';
import { PageBlocks } from '@/components/PageBlocks';
import { TopBlocks } from '@/components/TopBlocks';
import { realListings } from '@/lib/seo/hubStore';
import { savedFooter, topBlocks } from '@/lib/site/contentStore';
import { Suspense } from 'react';

/* The category bar follows the admin's choices (lib/seo/navStore.ts). The pages stay static: saving refreshes them. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const menu = await navMenu();
  const tops = await topBlocks();
  const listings = Object.values(tops)
    .flat()
    .some((b) => b.type === 'listings')
    ? await realListings()
    : [];
  const slots = Object.fromEntries(Object.entries(tops).map(([path, blocks]) => [path, <PageBlocks key={path} blocks={blocks} listings={listings} />]));
  const own = await savedFooter(); // columns built in Admin > Site builder, else the built-in ones
  return (
    <>
      <EarlyBar />
      <SiteNavByPath menu={menu} />
      <main id="main">
        <TopBlocks slots={slots} />
        {children}
      </main>
      <Footer columns={own?.map((c) => ({ title: c.title, links: c.links.map((l) => [l.label, l.href] as [string, string]) }))} />
      <Suspense fallback={null}>
        <VisitTracker />
      </Suspense>
      <TawkChat />
      <Suspense fallback={null}>
        <GoogleAnalytics />
      </Suspense>
    </>
  );
}
