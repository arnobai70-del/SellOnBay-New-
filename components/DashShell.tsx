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
      { label: 'Requests', href: '/dashboard/buyer/requests', icon: 'list', key: 'buyer-requests' },
      { label: 'Support', href: '/dashboard/buyer/support', icon: 'chat', key: 'buyer-support' },
      { label: 'Messages', href: '/messages?view=buyer', icon: 'chat', key: 'messages' },
    ],
    extra: [
      { label: 'Browse templates', href: '/', icon: 'bag' },
      { label: 'Your profile', href: '/account/profile', icon: 'user' },
      { label: 'Sign-in methods', href: '/account/sign-in', icon: 'user' },
      { label: 'Your data', href: '/account/privacy', icon: 'user' },
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
      { label: 'Revisions', href: '/dashboard/seller/revisions', icon: 'list', key: 'seller-revisions' },
      { label: 'Sales reports', href: '/dashboard/seller/reports', icon: 'chart', key: 'seller-reports' },
      { label: 'Promote', href: '/dashboard/seller/promote', icon: 'chart', key: 'seller-promote' },
      { label: 'Support', href: '/dashboard/seller/support', icon: 'chat', key: 'seller-support' },
      { label: 'Messages', href: '/messages?view=seller', icon: 'chat', key: 'messages' },
    ],
    extra: [
      { label: 'List a new site', href: '/sell/new', icon: 'plus' },
      { label: 'Your profile', href: '/account/profile', icon: 'user' },
      { label: 'Sign-in methods', href: '/account/sign-in', icon: 'user' },
      { label: 'Your data', href: '/account/privacy', icon: 'user' },
      { label: 'Back to site', href: '/', icon: 'home' },
    ],
  },
  admin: {
    name: 'Admin',
    label: 'Admin',
    initial: 'U',
    items: [
      { label: 'Overview', href: '/dashboard/admin', icon: 'grid', key: 'admin' },
      { label: 'Beta requests', href: '/dashboard/admin/beta', icon: 'list', key: 'admin-beta' },
      { label: 'Purchase requests', href: '/dashboard/admin/requests', icon: 'list', key: 'admin-requests' },
      { label: 'Support tickets', href: '/dashboard/admin/support', icon: 'chat', key: 'admin-support' },
      { label: 'Revisions', href: '/dashboard/admin/revisions', icon: 'list', key: 'admin-revisions' },
      { label: 'Promotions', href: '/dashboard/admin/promotions', icon: 'chart', key: 'admin-promotions' },
      { label: 'Listings', href: '/dashboard/admin/listings', icon: 'bag', key: 'admin-listings' },
      { label: 'Source files', href: '/dashboard/admin/files', icon: 'layers', key: 'admin-files' },
      { label: 'Visitors', href: '/dashboard/admin/analytics', icon: 'chart', key: 'admin-analytics' },
      { label: 'Visitors by country', href: '/dashboard/admin/analytics/countries', icon: 'chart', key: 'admin-countries' },
      { label: 'Sales reports', href: '/dashboard/admin/reports', icon: 'chart', key: 'admin-reports' },
      { label: 'Disputes', href: '/dashboard/admin/disputes', icon: 'scale', key: 'admin-disputes', group: 'Orders and money' },
      { label: 'Payouts', href: '/dashboard/admin/payouts', icon: 'wallet', key: 'admin-payouts', group: 'Orders and money' },
      { label: 'Payments to check', href: '/dashboard/admin/payments-review', icon: 'wallet', key: 'admin-payments-review', group: 'Orders and money' },
      { label: 'Releases', href: '/dashboard/admin/releases', icon: 'check', key: 'admin-releases', group: 'Orders and money' },
      { label: 'Seller plans', href: '/dashboard/admin/sellers', icon: 'user', key: 'admin-sellers', group: 'Orders and money' },
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
      { label: 'Site history', href: '/dashboard/admin/site/history', icon: 'list', key: 'admin-site-history', group: 'Site' },
      { label: 'Legal documents', href: '/dashboard/admin/legal', icon: 'list', key: 'admin-legal', group: 'Site' },
      { label: 'Content', href: '/dashboard/admin/cms', icon: 'list', key: 'admin-cms', group: 'Site' },
      { label: 'Settings', href: '/dashboard/admin/settings', icon: 'gear', key: 'admin-settings', group: 'Site' },
      { label: 'Launch check', href: '/dashboard/admin/launch', icon: 'check', key: 'admin-launch', group: 'Site' },
      { label: 'Maintenance Manager', href: '/dashboard/admin/maintenance', icon: 'tool', key: 'admin-maintenance', group: 'System' },
      { label: 'Feature flags', href: '/dashboard/admin/flags', icon: 'gear', key: 'admin-flags', group: 'System' },
      { label: 'Server and system', href: '/dashboard/admin/system', icon: 'pulse', key: 'admin-system', group: 'System' },
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
  badges,
}: {
  role: Role;
  active: string;
  title: string;
  children: React.ReactNode;
  name?: string;
  signedIn?: boolean;
  viewerRole?: Role;
  /* How many things wait behind a menu item, by item key (only the admin overview passes these). */
  badges?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const q = find.trim().toLowerCase();
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

  // The menu in its groups, in order; items before the first group have no heading.
  const groups: { name: string; items: Item[] }[] = [];
  for (const i of d.items) {
    const name = i.group ?? '';
    if (groups.at(-1)?.name !== name) groups.push({ name, items: [] });
    groups.at(-1)!.items.push(i);
  }
  // Which groups are open: the one with the current page, and Orders and money for an admin, unless the person folded them. Remembered per role
  // in this browser (read after the first paint, so the server and the browser draw the same menu first).
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const store = `sob-dash-groups:${role}`;
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setSaved(JSON.parse(localStorage.getItem(store) ?? '{}'));
      } catch {
        /* storage blocked: keep the defaults */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [store]);
  const isOpen = (g: string) => saved[g] ?? (g === here?.group || (role === 'admin' && g === 'Orders and money'));
  const toggle = (g: string) => {
    const next = { ...saved, [g]: !isOpen(g) };
    setSaved(next);
    try {
      localStorage.setItem(store, JSON.stringify(next));
    } catch {
      /* storage blocked: the choice lasts until the page is left */
    }
  };

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
        {role === 'admin' && (
          <div className="side-find">
            <label className="sr-only" htmlFor="dash-find">
              Find a page
            </label>
            <input id="dash-find" type="search" placeholder="Find a page" autoComplete="off" value={find} onChange={(e) => setFind(e.target.value)} />
          </div>
        )}
        <nav className="side-nav" ref={navRef}>
          {groups.map((g) => {
            const items = q ? g.items.filter((i) => i.label.toLowerCase().includes(q)) : g.items;
            if (!items.length) return null;
            const shut = !!g.name && !q && !isOpen(g.name);
            const waiting = g.items.reduce((s, i) => s + (badges?.[i.key] ?? 0), 0);
            const id = g.name ? 'grp-' + g.name.replace(/\W+/g, '-').toLowerCase() : undefined;
            return (
              <Fragment key={g.name || 'main'}>
                {g.name && (
                  <button type="button" className="grp" aria-expanded={!shut} aria-controls={id} onClick={() => toggle(g.name)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <span>{g.name}</span>
                    {shut && waiting > 0 && <span className="wait">{waiting} waiting</span>}
                  </button>
                )}
                <div className="grp-items" id={id} hidden={shut}>
                  {items.map((i) => (
                    <Link
                      key={i.key}
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
                      {(badges?.[i.key] ?? 0) > 0 && (
                        <span className="nb" aria-label={`${badges![i.key]} waiting`}>
                          {badges![i.key]}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </Fragment>
            );
          })}
          {q && !d.items.some((i) => i.label.toLowerCase().includes(q)) && <p className="side-empty">No page called that.</p>}
          <div className="grp grp-fixed">Go to</div>
          {d.extra.map((i) => (
            <Link key={i.href} className="it" href={i.href} onClick={close}>
              <Ico n={i.icon} />
              <span>{i.label}</span>
            </Link>
          ))}
          {can.some((r) => r !== role) && <div className="grp grp-fixed">Switch view</div>}
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
