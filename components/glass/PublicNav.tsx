'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { BRAND_NAME } from '@/lib/brand';
import { useCart } from '@/lib/glass/cart';
import { PUBLIC_LINKS, type NavLink } from '@/lib/glass/nav';
import { Button } from './Button';

const isHere = (path: string, href: string) => path === href || path.startsWith(href + '/');

/*
 * The public top bar. It is rendered on the server like the rest of the page; the phone menu is a <details>, so it opens without JavaScript, and a small
 * script only closes it after a link is chosen. `showCart` stays off until the cart exists (Phase 3), so nothing links to a page that is not there.
 */
export function PublicNav({
  links = PUBLIC_LINKS,
  account = { label: 'Sign in', href: '/login' }, // /signin arrives with the sign-in pages (Phase 3)
  showCart = false,
}: {
  links?: NavLink[];
  account?: NavLink;
  showCart?: boolean;
}) {
  const path = usePathname();
  const cartCount = useCart().length;
  const menu = useRef<HTMLDetailsElement>(null);
  const shut = () => menu.current?.removeAttribute('open');
  const list = links.map((l) => (
    <Link key={l.href} className="g-nav-link" href={l.href} aria-current={isHere(path, l.href) ? 'page' : undefined} onClick={shut}>
      {l.label}
    </Link>
  ));
  const cart = showCart && (
    <Button variant="ghost" href="/cart" onClick={shut}>
      {cartCount > 0 ? `Cart · ${cartCount}` : 'Cart'}
    </Button>
  );
  return (
    <nav className="g-glass g-nav" aria-label="Main">
      <Link className="g-logo" href="/">
        <span className="g-dot" aria-hidden="true" />
        {BRAND_NAME}
      </Link>
      <div className="g-nav-links">{list}</div>
      <div className="g-nav-acts">
        <span className="g-nav-acts g-nav-acts-wide">{cart}</span>
        <Button href={account.href}>{account.label}</Button>
        <details className="g-nav-menu" ref={menu}>
          <summary>Menu</summary>
          <div className="g-nav-sheet">
            {list}
            {showCart && (
              <Link className="g-nav-link" href="/cart" onClick={shut}>
                {cartCount > 0 ? `Cart · ${cartCount}` : 'Cart'}
              </Link>
            )}
          </div>
        </details>
      </div>
    </nav>
  );
}
