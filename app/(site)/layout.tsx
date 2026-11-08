import { Suspense } from 'react';
import { EarlyBar } from '@/components/EarlyBar';
import { Footer } from '@/components/Footer';
import { PageBlocks } from '@/components/PageBlocks';
import { SiteNavByPath } from '@/components/SiteNavByPath';
import { TawkChat } from '@/components/TawkChat';
import { TopBlocks } from '@/components/TopBlocks';
import { VisitTracker } from '@/components/VisitTracker';
import { GlassPage } from '@/components/glass/GlassPage';
import { MaintenanceBanner } from '@/components/glass/MaintenanceBanner';
import { PublicFooter } from '@/components/glass/PublicFooter';
import { PublicNav } from '@/components/glass/PublicNav';
import { BETA_BANNER_TEXT } from '@/lib/config';
import { legacyPublic } from '@/lib/legacy';
import { realListings } from '@/lib/seo/hubStore';
import { navMenu } from '@/lib/seo/navStore';
import { getSettings } from '@/lib/settings';
import { contactRoutes, savedFooter, savedSocial, topBlocks } from '@/lib/site/contentStore';

/*
 * The pages still in the (site) group (account, orders, payment, notifications, search, report abuse, maintenance, the listing form) wear the glass
 * frame since Phase 7: the same top bar, beta banner and footer as the public pages (app/(glass)/layout.tsx). Test servers built with
 * NEXT_PUBLIC_LEGACY_PUBLIC=1 keep the old dark frame for the older browser tests.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const tops = await topBlocks();
  const listings = Object.values(tops)
    .flat()
    .some((b) => b.type === 'listings')
    ? await realListings()
    : [];
  const slots = Object.fromEntries(Object.entries(tops).map(([path, blocks]) => [path, <PageBlocks key={path} blocks={blocks} listings={listings} />]));
  const social = await savedSocial();
  const tail = (
    <>
      <Suspense fallback={null}>
        <VisitTracker />
      </Suspense>
      <TawkChat />
    </>
  );
  if (legacyPublic()) {
    const [menu, own] = await Promise.all([navMenu(), savedFooter()]);
    return (
      <>
        <div className="night">
          <EarlyBar />
          <SiteNavByPath menu={menu} />
          <main id="main">
            <TopBlocks slots={slots} />
            {children}
          </main>
          <Footer columns={own?.map((c) => ({ title: c.title, links: c.links.map((l) => [l.label, l.href] as [string, string]) }))} social={social} />
        </div>
        {tail}
      </>
    );
  }
  const [{ paymentsMode }, routes] = await Promise.all([getSettings(), contactRoutes()]);
  return (
    <>
      <GlassPage>
        {paymentsMode === 'beta_free' && <p className="g-banner">{BETA_BANNER_TEXT}</p>}
        <MaintenanceBanner />
        <div className="g-wrap">
          <PublicNav showCart />
          <main id="main" className="g-old">
            <TopBlocks slots={slots} />
            {children}
          </main>
          <PublicFooter routes={routes} social={social} />
        </div>
      </GlassPage>
      {tail}
    </>
  );
}
