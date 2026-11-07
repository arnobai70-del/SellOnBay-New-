'use client';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { signOut } from '@/app/(bare)/login/actions';
import { BRAND_NAME } from '@/lib/brand';
import { ROLE_MENUS, type GlassRole } from '@/lib/glass/nav';
import { Button } from './Button';
import { GlassPage } from './GlassPage';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'U';

/*
 * The sidebar and top bar for all three roles, with the same main props as the old DashShell so pages can move over one at a time. `title` is the page's only h1.
 * `search` and `sideCard` are empty places for what later phases add (global search, the switch to selling, the public store link, system health).
 */
export function DashboardShell({
  role,
  active,
  title,
  subtitle,
  actions,
  search,
  sideCard,
  children,
  name,
  signedIn = false,
  viewerRole,
  badges,
  unread = 0,
}: {
  role: GlassRole;
  /* The key of the current menu item in lib/glass/nav.ts. */
  active: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  search?: React.ReactNode;
  sideCard?: React.ReactNode;
  children: React.ReactNode;
  name?: string;
  signedIn?: boolean;
  viewerRole?: GlassRole;
  /* How many things wait behind a menu item, by item key. */
  badges?: Record<string, number>;
  unread?: number;
}) {
  const menu = ROLE_MENUS[role];
  const shown = name || 'Your account';
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // Only an admin may look at the other dashboards.
  const others = signedIn && viewerRole === 'admin' ? (['admin', 'seller', 'buyer'] as const).filter((r) => r !== role) : [];

  // The phone menu: Escape closes it and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('sheet-open');
    };
  }, [open]);

  return (
    <GlassPage>
      <div className={'g-shell' + (open ? ' g-shell-open' : '')}>
        <aside className="g-glass g-side" id="g-dash-menu" aria-label={`${menu.label} menu`}>
          <Link className="g-logo" href="/">
            <span className="g-dot" aria-hidden="true" />
            {BRAND_NAME} <span className="g-tag">{menu.label}</span>
          </Link>
          <button className="g-iconbtn g-side-x" type="button" aria-label="Close menu" onClick={close}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <nav aria-label={`${menu.label} pages`}>
            {menu.groups.map((g) => (
              <Fragment key={g.name ?? 'main'}>
                {g.name && <div className="g-grp">{g.name}</div>}
                {g.items.map((i) => {
                  const waiting = badges?.[i.key] ?? 0;
                  return (
                    <Link key={i.key} className="g-mi" href={i.href} aria-current={i.key === active ? 'page' : undefined} onClick={close}>
                      <span>{i.label}</span>
                      {waiting > 0 && (
                        <span className="g-cnt" aria-label={`${waiting} new`}>
                          {waiting}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </Fragment>
            ))}
            {others.length > 0 && <div className="g-grp">Switch view</div>}
            {others.map((r) => (
              <Link key={r} className="g-mi" href={ROLE_MENUS[r].home} onClick={close}>
                <span>{ROLE_MENUS[r].label} view</span>
              </Link>
            ))}
          </nav>
          {sideCard && <div className="g-side-card">{sideCard}</div>}
          {signedIn && (
            <form className="g-side-ft" action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          )}
        </aside>
        {open && <button className="g-scrim" type="button" aria-hidden="true" tabIndex={-1} onClick={close} />}
        <div className="g-col">
          <header className="g-glass g-top">
            <button className="g-iconbtn g-menu-btn" type="button" aria-label="Open menu" aria-expanded={open} aria-controls="g-dash-menu" onClick={() => setOpen((o) => !o)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            {search ? <div className="g-top-search">{search}</div> : <div className="g-top-gap" />}
            <Button href={menu.cta.href}>{menu.cta.label}</Button>
            <Link className="g-iconbtn" href={menu.notifications} aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9a6 6 0 0 1 12 0c0 6 2 8 2 8H4s2-2 2-8M10 21a2 2 0 0 0 4 0" />
              </svg>
              {unread > 0 && (
                <span className="g-iconbtn-b" aria-hidden="true">
                  {unread}
                </span>
              )}
            </Link>
            <div className="g-me" title={`${shown} · ${menu.label}`}>
              <span className="g-av" aria-hidden="true">
                {initials(shown)}
              </span>
              <div className="g-me-t">
                <div className="g-me-n">{shown}</div>
                <div className="g-tag">{menu.label}</div>
              </div>
            </div>
          </header>
          <main id="main" className="g-stack">
            <div className="g-row">
              <div>
                <h1>{title}</h1>
                {subtitle && <div className="g-tag">{subtitle}</div>}
              </div>
              {actions}
            </div>
            {children}
          </main>
        </div>
      </div>
    </GlassPage>
  );
}
