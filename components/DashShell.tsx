'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import { DashIcon as Ico, type IconName } from './DashIcon';
import { Logo } from './Logo';
import { signOut } from '@/app/(bare)/login/actions';

export type Role = 'buyer' | 'seller' | 'admin';
/* group: a heading the item sits under in the menu (items keep their order; a new heading starts when the group changes). */
type Item = { label: string; href: string; icon: IconName; key: string; group?: string };
const DASH: Record<Role, { name: string; label: string; initial: string; items: Item[]; extra: Omit<Item, 'key'>[] }> = {
  buyer: {
    name: 'Your account',
    label: 'Buyer',
    initial: 'U',
    items: [
      { label: 'Overview', href: '/dashboard/buyer', icon: 'grid', key: 'buyer' },
      { label: 'Messages', href: '/messages?view=buyer', icon: 'chat', key: 'messages' },
    ],
    extra: [
      { label: 'Browse templates', href: '/', icon: 'bag' },
      { label: 'Back to site', href: '/', icon: 'home' },
    ],
  },
  seller: {
    name: 'Your account',
    label: 'Seller',
    initial: 'U',
    items: [
      { label: 'Overview', href: '/dashboard/seller', icon: 'grid', key: 'seller' },
      { label: 'My listings', href: '/dashboard/seller#listings', icon: 'bag', key: 'seller-listings' },
      { label: 'Messages', href: '/messages?view=seller', icon: 'chat', key: 'messages' },
    ],
    extra: [
      { label: 'List a new site', href: '/sell/new', icon: 'plus' },
      { label: 'Back to site', href: '/', icon: 'home' },
    ],
  },
  admin: {
    name: 'Admin',
    label: 'Admin',
    initial: 'U',
    items: [
      { label: 'Overview', href: '/dashboard/admin', icon: 'grid', key: 'admin' },
      { label: 'Listings', href: '/dashboard/admin/listings', icon: 'bag', key: 'admin-listings' },
      { label: 'Visitors', href: '/dashboard/admin/analytics', icon: 'chart', key: 'admin-analytics' },
      { label: 'Disputes', href: '/dashboard/admin/disputes', icon: 'scale', key: 'admin-disputes', group: 'Orders and money' },
      { label: 'Payouts', href: '/dashboard/admin/payouts', icon: 'wallet', key: 'admin-payouts', group: 'Orders and money' },
      { label: 'New versions', href: '/dashboard/admin/versions', icon: 'layers', key: 'admin-versions', group: 'Orders and money' },
      { label: 'Repository access', href: '/dashboard/admin/repo', icon: 'branch', key: 'admin-repo', group: 'Orders and money' },
      { label: 'Accounts', href: '/dashboard/admin/users', icon: 'user', key: 'admin-users', group: 'People' },
      { label: 'Abuse reports', href: '/dashboard/admin/abuse', icon: 'flag', key: 'admin-abuse', group: 'People' },
      { label: 'Messages', href: '/messages?view=admin', icon: 'chat', key: 'messages', group: 'People' },
      { label: 'Risk', href: '/dashboard/admin/risk', icon: 'pulse', key: 'admin-risk', group: 'Safety' },
      { label: 'Security', href: '/dashboard/admin/security', icon: 'lock', key: 'admin-security', group: 'Safety' },
      { label: 'Audit log', href: '/dashboard/admin/audit', icon: 'list', key: 'admin-audit', group: 'Safety' },
      { label: 'Site builder', href: '/dashboard/admin/site', icon: 'layers', key: 'admin-site', group: 'Site' },
      { label: 'SEO and blog', href: '/dashboard/admin/seo', icon: 'search', key: 'admin-seo', group: 'Site' },
      { label: 'Settings', href: '/dashboard/admin/settings', icon: 'gear', key: 'admin-settings', group: 'Site' },
      { label: 'Launch check', href: '/dashboard/admin/launch', icon: 'check', key: 'admin-launch', group: 'Site' },
      { label: 'Maintenance Manager', href: '/dashboard/admin/maintenance', icon: 'tool', key: 'admin-maintenance', group: 'System' },
    ],
    extra: [{ label: 'Back to site', href: '/', icon: 'home' }],
  },
};

export function DashShell({
  role,
  active,
  title,
  children,
  name,
  signedIn = false,
  viewerRole,
}: {
  role: Role;
  active: string;
  title: string;
  children: React.ReactNode;
  name?: string;
  signedIn?: boolean;
  viewerRole?: Role;
}) {
  const [open, setOpen] = useState(false);
  // A clicked menu link answers at once: it lights up and shows it is loading until the page address changes.
  const search = useSearchParams().toString();
  const at = usePathname() + (search ? '?' + search : '');
  const [click, setClick] = useState({ href: '', from: '' });
  const going = click.from === at ? click.href : '';
  const d = DASH[role];
  const shown = name || d.name;
  // Buyers and sellers each have their own dashboard and no link to the other one (the server also keeps each role out of the other's page). Only an admin may look at all three.
  const can: Role[] = signedIn && viewerRole === 'admin' ? ['admin', 'seller', 'buyer'] : [role];
  const roleLabel = signedIn && viewerRole ? viewerRole[0].toUpperCase() + viewerRole.slice(1) : d.label;
  const here = d.items.find((i) => i.key === active);
  const crumb = here && here.key !== role ? (here.group ?? d.label) : null;

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
  const close = () => setOpen(false);

  // On a short screen the menu scrolls: start it where the current page's link can be seen.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const cur = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && cur && cur.offsetTop + cur.offsetHeight > nav.clientHeight) nav.scrollTop = cur.offsetTop - nav.clientHeight / 2;
  }, [active]);

  return (
    <div className={'dash dash-' + role + (open ? ' open' : '')}>
      <aside className="side" id="dash-menu" aria-label="Dashboard">
        <div className="side-hd">
          <Logo />
          <button className="side-x" type="button" aria-label="Close menu" onClick={close}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav className="side-nav" ref={navRef}>
          {d.items.map((i, n) => (
            <Fragment key={i.key}>
              {i.group && i.group !== d.items[n - 1]?.group && <div className="grp">{i.group}</div>}
              <Link
                className={'it' + (going === i.href ? ' going' : '')}
                href={i.href}
                aria-current={i.key === active ? 'page' : undefined}
                aria-busy={going === i.href || undefined}
                onClick={() => {
                  if (i.href.split('#')[0] !== at) setClick({ href: i.href, from: at });
                  close();
                }}
              >
                <Ico n={i.icon} />
                <span>{i.label}</span>
              </Link>
            </Fragment>
          ))}
          <div className="grp">Go to</div>
          {d.extra.map((i) => (
            <Link key={i.href} className="it" href={i.href} onClick={close}>
              <Ico n={i.icon} />
              <span>{i.label}</span>
            </Link>
          ))}
          {can.some((r) => r !== role) && <div className="grp">Switch view</div>}
          {can
            .filter((r) => r !== role)
            .map((r) => (
              <Link key={r} className="it" href={`/dashboard/${r}`} onClick={close}>
                <Ico n="user" />
                <span>{r[0].toUpperCase() + r.slice(1)} view</span>
              </Link>
            ))}
        </nav>
        <div className="side-ft">
          <div className="who">
            <span className="av">{shown[0]?.toUpperCase() ?? d.initial}</span>
            <div className="nm">
              <b title={shown}>{shown}</b>
              <small>{roleLabel} account</small>
            </div>
          </div>
          {signedIn && (
            <form action={signOut}>
              <button className="signout" type="submit">
                Sign out
              </button>
            </form>
          )}
        </div>
      </aside>
      {open && <button className="dash-scrim" type="button" aria-hidden="true" tabIndex={-1} onClick={close} />}
      <div className="main" id="main">
        <header className="top">
          <button className="menu-btn" type="button" aria-label="Open menu" aria-expanded={open} aria-controls="dash-menu" onClick={() => setOpen((o) => !o)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="top-t">
            {crumb && <small>{crumb}</small>}
            <h1>{title}</h1>
          </div>
          <div className="top-r">
            <Link className="top-site" href="/" target="_blank">
              View site
            </Link>
            <span className="av top-av" title={`${shown} · ${roleLabel} account`}>
              {shown[0]?.toUpperCase() ?? d.initial}
            </span>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
