'use client';
import Link from 'next/link';
import { BrandMark } from '@/components/glass/BrandMark';
import { usePathname } from 'next/navigation';
import { BRAND_NAME } from '@/lib/brand';
import { useCart } from '@/lib/glass/cart';
import { PUBLIC_LINKS, type NavLink } from '@/lib/glass/nav';
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
}: {
  links?: NavLink[];
  account?: NavLink;
  showCart?: boolean;
  search?: boolean;
}) {
  const path = usePathname() ?? '/';
  const cartCount = useCart().length;
  return (
    <nav className="glass nav" aria-label="Main">
      <Link className="logo" href="/" prefetch={false}>
        <BrandMark />
        {BRAND_NAME}
      </Link>
      <div className="navlinks">
        {links.map((l) => (
          <Link key={l.href} className={isHere(path, l.href) ? 'cur' : undefined} href={l.href} prefetch={false} aria-current={isHere(path, l.href) ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {search && <SearchBox compact placeholder="Search" />}
        {showCart && (
          <Link className="btn ghost" href="/cart" prefetch={false} data-track="cart">
            {cartCount > 0 ? `Cart · ${cartCount}` : 'Cart'}
          </Link>
        )}
        <Link className="btn" href={account.href} prefetch={false}>
          {account.label}
        </Link>
      </div>
    </nav>
  );
}
