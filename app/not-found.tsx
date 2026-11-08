import Link from 'next/link';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassPage } from '@/components/glass/GlassPage';
import { PublicFooter } from '@/components/glass/PublicFooter';
import { PublicNav } from '@/components/glass/PublicNav';
import { pageCopy } from '@/lib/content/copy';
import { PUBLIC_LINKS } from '@/lib/glass/nav';

/* Its words come from Admin › Content › Pages (lib/content/registry.ts, "Page not found"). */
export default async function NotFound() {
  const [c, nav, foot] = await Promise.all([pageCopy('not-found'), pageCopy('nav'), pageCopy('footer')]);
  return (
    <GlassPage>
      <div className="g-wrap">
        <PublicNav showCart links={PUBLIC_LINKS.map((l) => ({ ...l, label: nav.t('links', l.href.slice(1), l.label) }))} />
        <main id="main" className="g-hero">
          <div className="g-tag">Error 404</div>
          <h1>{c.t('main', 'heading')}</h1>
          <p className="g-lead">{c.t('main', 'text')}</p>
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
        <PublicFooter tagline={foot.t('main', 'tagline')} contactTitle={foot.t('main', 'contact')} />
      </div>
    </GlassPage>
  );
}
