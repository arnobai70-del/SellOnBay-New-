import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { pageCopy } from '@/lib/content/copy';
import { FOOTER_COLUMNS, PUBLIC_LINKS } from '@/lib/glass/nav';
import { localizedPath } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import { localizeFooter, localizeNav } from '@/lib/i18n/ui';
import { getSettings } from '@/lib/settings';
import { contactRoutes, savedSocial } from '@/lib/site/contentStore';
import { GlassPage } from './GlassPage';
import { MaintenanceBanner } from './MaintenanceBanner';
import { PublicFooter } from './PublicFooter';
import { PublicNav } from './PublicNav';

/*
 * A public page of design-reference/: <div class="page"><div class="wrap"> nav, the page, footer. `file` names the design file the page is ported
 * from, so its own rules apply (app/sob.css). The free-beta and maintenance notices sit above the nav. The words and links follow the page's
 * language (lib/i18n); the language choice sits in the top bar and the footer once an admin has published a second language.
 */
export async function PublicFrame({ file, children, chrome = true }: { file: string; children: React.ReactNode; chrome?: boolean }) {
  if (!chrome)
    return (
      <GlassPage file={file}>
        <main id="main">{children}</main>
      </GlassPage>
    );
  const [{ paymentsMode }, routes, social, nav, foot, i] = await Promise.all([getSettings(), contactRoutes(), savedSocial(), pageCopy('nav'), pageCopy('footer'), getI18n()]);
  const links = localizeNav(PUBLIC_LINKS, i.t, i.lang, (l) => nav.t('links', l.href.slice(1), l.label)); // includes Affiliate, always shown (owner, 2026-11-12)
  const switcher = (id: string) => <LanguageSwitcher id={id} languages={i.languages.map((l) => ({ code: l.code, native: l.native }))} current={i.lang} label={i.t('lang.label')} />;
  return (
    <GlassPage file={file}>
      {paymentsMode === 'beta_free' && (
        <p className="sob-note" role="note">
          {i.t('banner.beta')}
        </p>
      )}
      <MaintenanceBanner />
      <div className="wrap">
        <PublicNav
          links={links}
          home={localizedPath('/', i.lang)}
          account={{ label: i.t('nav.signin'), href: localizedPath('/signin', i.lang) }}
          words={{ search: i.t('nav.search'), cart: i.t('nav.cart'), cartCount: i.t('nav.cartCount'), openMenu: i.t('nav.openMenu'), closeMenu: i.t('nav.closeMenu') }}
          langSwitch={switcher('lang-top')}
        />
        <main id="main">{children}</main>
        <PublicFooter
          columns={localizeFooter(FOOTER_COLUMNS, i.t, i.lang)}
          routes={routes}
          social={social}
          tagline={foot.t('main', 'tagline')}
          contactTitle={foot.t('main', 'contact')}
          home={localizedPath('/', i.lang)}
          createdBy={i.t('footer.createdBy')}
          langSwitch={switcher('lang-foot')}
        />
      </div>
    </GlassPage>
  );
}
