import Link from 'next/link';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassPage } from '@/components/glass/GlassPage';
import { PublicFooter } from '@/components/glass/PublicFooter';
import { PublicNav } from '@/components/glass/PublicNav';

export default function NotFound() {
  return (
    <GlassPage>
      <div className="g-wrap">
        <PublicNav showCart />
        <main id="main" className="g-hero">
          <div className="g-tag">Error 404</div>
          <h1>This page doesn&apos;t exist</h1>
          <p className="g-lead">The link may be old, or the website was removed by its seller. Try searching instead.</p>
          <form className="g-glass g-search" action="/websites" method="get" role="search">
            <label className="g-sr" htmlFor="nf-q">
              Search websites
            </label>
            <input id="nf-q" name="q" placeholder="Search websites" />
            <Button type="submit">Search</Button>
          </form>
          <GlassCard rise={false} className="g-row">
            <Link href="/">Home</Link>
            <Link href="/websites">Browse websites</Link>
            <Link href="/help">Help center</Link>
          </GlassCard>
        </main>
        <PublicFooter />
      </div>
    </GlassPage>
  );
}
