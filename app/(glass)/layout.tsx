import { Suspense } from 'react';
import { GlassPage } from '@/components/glass/GlassPage';
import { PublicFooter } from '@/components/glass/PublicFooter';
import { PublicNav } from '@/components/glass/PublicNav';
import { TawkChat } from '@/components/TawkChat';
import { VisitTracker } from '@/components/VisitTracker';
import { BETA_BANNER_TEXT } from '@/lib/config';
import { getSettings } from '@/lib/settings';
import { contactRoutes, savedSocial } from '@/lib/site/contentStore';

/* The public pages on the glass UI. The page keeps its own <main> wrapper here so /design-preview, which draws its own shells, is untouched. */
export default async function GlassLayout({ children }: { children: React.ReactNode }) {
  const [{ paymentsMode }, routes, social] = await Promise.all([getSettings(), contactRoutes(), savedSocial()]);
  return (
    <>
      <GlassPage>
        {paymentsMode === 'beta_free' && <p className="g-banner">{BETA_BANNER_TEXT}</p>}
        <div className="g-wrap">
          <PublicNav showCart />
          <main id="main">{children}</main>
          <PublicFooter routes={routes} social={social} />
        </div>
      </GlassPage>
      <Suspense fallback={null}>
        <VisitTracker />
      </Suspense>
      <TawkChat />
    </>
  );
}
