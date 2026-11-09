import { BETA_BANNER_TEXT } from '@/lib/config';
import { pageCopy } from '@/lib/content/copy';
import { PUBLIC_LINKS } from '@/lib/glass/nav';
import { getSettings } from '@/lib/settings';
import { contactRoutes, savedSocial } from '@/lib/site/contentStore';
import { GlassPage } from './GlassPage';
import { MaintenanceBanner } from './MaintenanceBanner';
import { PublicFooter } from './PublicFooter';
import { PublicNav } from './PublicNav';

/*
 * A public page of design-reference/: <div class="page"><div class="wrap"> nav, the page, footer. `file` names the design file the page is ported
 * from, so its own rules apply (app/sob.css). The free-beta and maintenance notices sit above the nav.
 */
export async function PublicFrame({ file, children, chrome = true }: { file: string; children: React.ReactNode; chrome?: boolean }) {
  if (!chrome)
    return (
      <GlassPage file={file}>
        <main id="main">{children}</main>
      </GlassPage>
    );
  const [{ paymentsMode }, routes, social, nav, foot] = await Promise.all([getSettings(), contactRoutes(), savedSocial(), pageCopy('nav'), pageCopy('footer')]);
  return (
    <GlassPage file={file}>
      {paymentsMode === 'beta_free' && (
        <p className="sob-note" role="note">
          {BETA_BANNER_TEXT}
        </p>
      )}
      <MaintenanceBanner />
      <div className="wrap">
        <PublicNav links={PUBLIC_LINKS.map((l) => ({ ...l, label: nav.t('links', l.href.slice(1), l.label) }))} />
        <main id="main">{children}</main>
        <PublicFooter routes={routes} social={social} tagline={foot.t('main', 'tagline')} contactTitle={foot.t('main', 'contact')} />
      </div>
    </GlassPage>
  );
}
