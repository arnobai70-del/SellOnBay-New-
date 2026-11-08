import { Suspense } from 'react';
import { PageBlocks } from '@/components/PageBlocks';
import { TawkChat } from '@/components/TawkChat';
import { TopBlocks } from '@/components/TopBlocks';
import { VisitTracker } from '@/components/VisitTracker';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { realListings } from '@/lib/seo/hubStore';
import { topBlocks } from '@/lib/site/contentStore';

/*
 * The pages still in the (site) group (account, orders, payment, notifications, search, report abuse, maintenance, the listing form) have no
 * design file of their own: they wear the public frame of design-reference/help.html (top bar, footer, notices), like every other public page.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const tops = await topBlocks();
  const listings = Object.values(tops)
    .flat()
    .some((b) => b.type === 'listings')
    ? await realListings()
    : [];
  const slots = Object.fromEntries(Object.entries(tops).map(([path, blocks]) => [path, <PageBlocks key={path} blocks={blocks} listings={listings} />]));
  return (
    <>
      <PublicFrame file="help">
        <div style={{ paddingTop: 32 }}>
          <TopBlocks slots={slots} />
          {children}
        </div>
      </PublicFrame>
      <Suspense fallback={null}>
        <VisitTracker />
      </Suspense>
      <TawkChat />
    </>
  );
}
