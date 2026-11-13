import Link from 'next/link';
import { MobileToggle } from '@/components/glass/MobileToggle';
import { BrandMark } from '@/components/glass/BrandMark';
import { Fragment } from 'react';
import { signOut } from '@/app/(bare)/login/actions';
import { BRAND_NAME } from '@/lib/brand';
import { ROLE_MENUS, type GlassRole } from '@/lib/glass/nav';
import { GlassPage } from './GlassPage';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { getI18n } from '@/lib/i18n/server';

import { T } from '@/components/i18n/T';
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'U';

/* The avatar colour of each role in the design files (admin.html, buyer.html, seller-dashboard.html). */
const AV: Record<GlassRole, string> = { admin: '#E6E2F4', buyer: '#DDEAF6', seller: '#E6E2F4' };

/*
 * The sidebar and top bar of design-reference/admin.html, buyer.html and seller-dashboard.html, ported as they are: .side with .mi items and .grp
 * headings, the side card, and the .topbar with search, the main button, notifications, language and the person. `file` is the design file the page
 * is ported from, so its own rules apply. `title` is the page's only h1.
 */
export async function DashboardShell({
  role,
  file,
  active,
  title,
  subtitle,
  actions,
  sideCard,
  children,
  name,
  signedIn = false,
  viewerRole,
  badges,
  unread = 0,
  hideCta = false,
  search,
  head = true,
}: {
  role: GlassRole;
  file?: string;
  /* The key of the current menu item in lib/glass/nav.ts. */
  active: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  sideCard?: React.ReactNode;
  children: React.ReactNode;
  name?: string;
  signedIn?: boolean;
  viewerRole?: GlassRole;
  /* How many things wait behind a menu item, by item key. */
  badges?: Record<string, number>;
  unread?: number;
  /* Hide the top bar's main button (the admin's manual order while the free beta runs). */
  hideCta?: boolean;
  /* Where the top bar's search goes (a GET form with q), and what it says. */
  search?: { action: string; placeholder: string };
  /* Draw the page's heading row (h1, subtitle, actions); a page that ports its own heading row turns it off. */
  head?: boolean;
}) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const menu = ROLE_MENUS[role];
  // The menus in the visitor's language (lib/i18n, owner 2026-11-12); a word the catalogue does not know stays in English.
  const tr = await getI18n();
  const w = (label: string) => {
    const v = tr.t(`menu.${label}`);
    return v === `menu.${label}` ? label : v;
  };
  const shown = name || tx('Your account');
  // Only an admin may look at the other dashboards.
  const others = signedIn && viewerRole === 'admin' ? (['admin', 'seller', 'buyer'] as const).filter((r) => r !== role) : [];
  const find = search ?? { ...menu.search, placeholder: tr.t(`menu.search.${role}`) };
  return (
    <GlassPage kind="d" file={file ?? menu.file}>
      <div className="shell">
        <MobileToggle label={tx('Menu')} className="sob-mt-side">
          <aside className="glass side" aria-label={`${menu.label} menu`}>
            <Link className="logo" href="/" prefetch={false}>
              <BrandMark />
              {BRAND_NAME}{' '}
              <span className="tag" style={{ margin: '0 0 0 2px' }}>
                {w(menu.label)}
              </span>
            </Link>
            {menu.groups.map((g) => (
              <Fragment key={g.name ?? 'main'}>
                {g.name && <div className="grp">{w(g.name)}</div>}
                {g.items.map((i) => {
                  const waiting = badges?.[i.key] ?? 0;
                  return (
                    <Link key={i.key} className={i.key === active ? 'mi on' : 'mi'} href={i.href} prefetch={false} aria-current={i.key === active ? 'page' : undefined}>
                      <span>{w(i.label)}</span>
                      {waiting > 0 && (
                        <span className="cnt" aria-label={`${waiting} waiting`}>
                          {waiting}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </Fragment>
            ))}
            {others.length > 0 && (
              <div className="grp">
                <T s={'Switch view'} />
              </div>
            )}
            {others.map((r) => (
              <Link key={r} className="mi" href={ROLE_MENUS[r].home} prefetch={false}>
                <span>
                  <T s={'{label} view'} v={{ label: ROLE_MENUS[r].label }} />
                </span>
              </Link>
            ))}
            <div className="sob-sidecard" style={{ marginTop: 14, padding: 14, borderRadius: 14, background: 'rgba(255,255,255,.6)', border: '1px solid #DCE7EC' }}>
              {sideCard}
              {signedIn && (
                <form action={signOut} style={{ marginTop: sideCard ? 8 : 0 }}>
                  <button type="submit" className="tag" style={{ display: 'block', margin: 0, padding: 0, border: 0, background: 'none', cursor: 'pointer', color: '#1A5444' }}>
                    <T s={'Sign out'} />
                  </button>
                </form>
              )}
            </div>
          </aside>
        </MobileToggle>
        <div className="col">
          <header className="glass topbar">
            <form className="gsearch" action={find.action} method="get" role="search">
              <label htmlFor="gs" className="hidden-label">
                {role === 'admin' ? tx('Search everything') : tx('Search')}
              </label>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#566C78" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input id="gs" name="q" placeholder={find.placeholder} enterKeyHint="search" />
              <kbd>Ctrl K</kbd>
            </form>
            {!hideCta && (
              <Link className="btn" href={menu.cta.href} prefetch={false}>
                {w(menu.cta.label)}
              </Link>
            )}
            <Link className="iconbtn" href={menu.notifications} prefetch={false} aria-label={unread > 0 ? `Notifications, ${unread} new` : tx('Notifications')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
                <path d="M10 21a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && <span className="b">{unread}</span>}
            </Link>
            <LanguageSwitcher id="lang" languages={tr.languages.map((l) => ({ code: l.code, native: l.native }))} current={tr.lang} label={tr.t('lang.label')} />
            <div className="me">
              <span className="av" style={{ background: AV[role] }} aria-hidden="true">
                {initials(shown)}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{shown}</div>
                <div className="tag" style={{ margin: 0 }}>
                  {w(menu.label)}
                </div>
              </div>
            </div>
          </header>
          <main id="main" style={{ display: 'contents' }}>
            {head && (
              <div className="row">
                <div>
                  <h1>{title}</h1>
                  {subtitle && <div className="tag">{subtitle}</div>}
                </div>
                {actions}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </GlassPage>
  );
}
