import { Suspense } from 'react';
import { GlassPage } from '@/components/glass/GlassPage';
import { MaintenanceBanner } from '@/components/glass/MaintenanceBanner';
import { PublicFooter } from '@/components/glass/PublicFooter';
import { PublicNav } from '@/components/glass/PublicNav';
import { TawkChat } from '@/components/TawkChat';
import { VisitTracker } from '@/components/VisitTracker';
import { BETA_BANNER_TEXT } from '@/lib/config';
import { getSettings } from '@/lib/settings';
import { pageCopy } from '@/lib/content/copy';
import { PUBLIC_LINKS } from '@/lib/glass/nav';
import { contactRoutes, savedSocial } from '@/lib/site/contentStore';

/* The public pages on the glass UI. Each page keeps its own <main> inside this frame. */
export default async function GlassLayout({ children }: { children: React.ReactNode }) {
  const [{ paymentsMode }, routes, social, nav, foot] = await Promise.all([getSettings(), contactRoutes(), savedSocial(), pageCopy('nav'), pageCopy('footer')]);
  return (
    <>
      <GlassPage>
        {paymentsMode === 'beta_free' && <p className="g-banner">{BETA_BANNER_TEXT}</p>}
        <MaintenanceBanner />
        <div className="g-wrap">
          <PublicNav showCart links={PUBLIC_LINKS.map((l) => ({ ...l, label: nav.t('links', l.href.slice(1), l.label) }))} />
          <main id="main">{children}</main>
          <PublicFooter routes={routes} social={social} tagline={foot.t('main', 'tagline')} contactTitle={foot.t('main', 'contact')} />
        </div>
      </GlassPage>
      <Suspense fallback={null}>
        <VisitTracker />
      </Suspense>
      <TawkChat />
    </>
  );
}
