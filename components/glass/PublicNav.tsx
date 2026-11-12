'use client';
import Link from 'next/link';
import { BrandMark } from '@/components/glass/BrandMark';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BRAND_NAME } from '@/lib/brand';
import { useCart } from '@/lib/glass/cart';
import { PUBLIC_LINKS, type NavLink } from '@/lib/glass/nav';
import { AccountMenu } from './AccountMenu';
import { SearchBox } from './SearchBox';

const isHere = (path: string, href: string) => path === href || path.startsWith(href + '/');

/*
 * The public top bar of design-reference/*.html (<nav class="glass nav">): logo, .navlinks (the current one is .cur), then the cart and sign-in buttons.
 * The owner's site search (2026-11-08) sits between the links and the buttons. Links never prefetch: only primary buttons on a page do.
 */
export function PublicNav({
  links = PUBLIC_LINKS,
  account = { label: 'Sign in', href: '/signin' },
  showCart = true,
  search = true,
  home = '/',
  words = { search: 'Search', cart: 'Cart', cartCount: 'Cart · {n}', openMenu: 'Open menu', closeMenu: 'Close menu' },
  langSwitch = null,
}: {
  links?: NavLink[];
  account?: NavLink;
  showCart?: boolean;
  search?: boolean;
  home?: string;
  words?: { search: string; cart: string; cartCount: string; openMenu: string; closeMenu: string };
  langSwitch?: React.ReactNode;
}) {
  const path = usePathname() ?? '/';
  const cartCount = useCart().length;
  // Phones (owner, 2026-11-11): the links sit behind a menu button and open as a sheet; a link, Escape or a new page closes it.
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [menu]);
  return (
    <nav className="glass nav" aria-label="Main">
      <Link className="logo" href={home} prefetch={false}>
        <BrandMark />
        {BRAND_NAME}
      </Link>
      <button type="button" className="sob-burger" aria-expanded={menu} aria-controls="sob-navlinks" aria-label={menu ? words.closeMenu : words.openMenu} onClick={() => setMenu((v) => !v)}>
        <span aria-hidden="true" />
      </button>
      <div id="sob-navlinks" className={menu ? 'navlinks open' : 'navlinks'}>
        {links.map((l) => (
          <Link key={l.href} className={isHere(path, l.href) ? 'cur' : undefined} href={l.href} prefetch={false} aria-current={isHere(path, l.href) ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
      <div className="sob-navr">
        {search && <SearchBox compact placeholder={words.search} />}
        {showCart && (
          <Link className="btn ghost" href="/cart" prefetch={false} data-track="cart">
            {cartCount > 0 ? words.cartCount.replace('{n}', String(cartCount)) : words.cart}
          </Link>
        )}
        {langSwitch}
        <AccountMenu fallback={account} />
      </div>
    </nav>
  );
}
