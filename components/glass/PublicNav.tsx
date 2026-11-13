'use client';
import Link from 'next/link';
import { BrandMark } from '@/components/glass/BrandMark';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BRAND_NAME } from '@/lib/brand';
import { useCart } from '@/lib/glass/cart';
import { PUBLIC_LINKS, type NavLink } from '@/lib/glass/nav';
import { AccountMenu } from './AccountMenu';
import { SearchBox } from './SearchBox';

import { useTx } from '@/components/i18n/TxProvider';
const isHere = (path: string, href: string) => path === href || path.startsWith(href + '/');

/*
 * The public top bar of design-reference/*.html (<nav class="glass nav">): logo, .navlinks (the current one is .cur), then the cart and sign-in buttons.
 * The owner's site search (2026-11-08) sits between the links and the buttons. Links never prefetch: only primary buttons on a page do.
 */
export function PublicNav({
  links = PUBLIC_LINKS,
  account = { label: 'Sign in', href: '/signin' }, // callers pass the translated words
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
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
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
  // Fit (owner, 2026-11-14): in a language with longer words the links do not fit beside search, cart and the language choice. Measured in
  // the full layout (what logo, links and right side need), then on every resize, in two steps: first the search box gets narrower
  // (.sob-tight); if that is still not enough, the bar uses the menu button and sheet the phones use (.sob-compact). No link is ever cut off
  // or pushed onto a second row. Without JavaScript the links scroll sideways.
  const navRef = useRef<HTMLElement>(null);
  const [fit, setFit] = useState<'full' | 'tight' | 'compact'>('full');
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      if (window.innerWidth <= 760) return setFit('full'); // phones already use the menu button (app/sob-extra.css)
      // Try each form and keep the first whose links fit their space exactly (the classes are put back before the browser paints).
      const links = nav.querySelector('.navlinks') as HTMLElement | null;
      if (!links) return;
      const before = nav.className;
      const fits = () => links.scrollWidth <= links.clientWidth + 1;
      nav.classList.remove('sob-tight', 'sob-compact');
      let next: 'full' | 'tight' | 'compact' = 'full';
      if (!fits()) {
        nav.classList.add('sob-tight');
        next = fits() ? 'tight' : 'compact';
      }
      nav.className = before;
      setFit(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    void document.fonts?.ready.then(measure); // a language's own font changes the words' widths once it has loaded
    return () => ro.disconnect();
  }, []);
  return (
    <nav ref={navRef} className={fit === 'full' ? 'glass nav' : `glass nav sob-${fit}`} aria-label={tx('Main')}>
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
