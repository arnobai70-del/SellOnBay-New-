import Link from 'next/link';
import { Button } from '@/components/glass/Button';
import { Field } from '@/components/glass/Field';
import { GlassCard } from '@/components/glass/GlassCard';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { PageExtras } from '@/components/PageExtras';
import { browse, browseHref, readQuery, SORTS, SORT_LABEL } from '@/lib/glass/browse';
import { CATEGORY_SLUGS, publicWebsites, websiteCategories } from '@/lib/glass/catalog';
import { HUBS } from '@/lib/seo/hubs';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/websites', { alternates: { canonical: '/websites' } });

export default async function Websites({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = readQuery(await searchParams, CATEGORY_SLUGS);
  const [sites, cats, words] = await Promise.all([publicWebsites(), websiteCategories(), pageWords('/websites')]);
  const r = browse(sites, q, (p) => cats.of(p)?.slug ?? null);
  const hub = HUBS.find((h) => h.slug === q.category);
  return (
    <>
      <div className="g-head">
        <h1>{words.heading}</h1>
        <form className="g-glass g-search" action="/websites" method="get" role="search">
          <label className="g-sr" htmlFor="q">
            Search websites
          </label>
          <input id="q" name="q" defaultValue={q.q} placeholder="Search full-stack websites" />
          {q.category && <input type="hidden" name="category" value={q.category} />}
          <Button type="submit">Search</Button>
        </form>
      </div>
      <div className="g-layout">
        <GlassCard as="aside" rise={false} aria-label="Filters">
          <h2>Filters</h2>
          <nav aria-label="Category" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Link className="g-mi" href={browseHref(q, { category: '' })} aria-current={q.category ? undefined : 'page'}>
              All websites
            </Link>
            {HUBS.map((h) => (
              <Link key={h.slug} className="g-mi" href={browseHref(q, { category: h.slug })} aria-current={q.category === h.slug ? 'page' : undefined}>
                {h.name.replace(/ Websites$/, '')}
              </Link>
            ))}
          </nav>
          <form className="g-stack" action="/websites" method="get" style={{ marginTop: 16 }}>
            {q.q && <input type="hidden" name="q" value={q.q} />}
            {q.category && <input type="hidden" name="category" value={q.category} />}
            <Field label="Lowest price ($)" name="min" inputMode="decimal" defaultValue={q.min ?? ''} />
            <Field label="Highest price ($)" name="max" inputMode="decimal" defaultValue={q.max ?? ''} />
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40, fontSize: 14 }}>
              <input type="checkbox" name="rated" value="1" defaultChecked={q.rated} style={{ width: 18, height: 18 }} />4 stars and up
            </label>
            <Field as="select" label="Sort by" name="sort" defaultValue={q.sort}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </Field>
            <Button type="submit" variant="ghost">
              Apply
            </Button>
          </form>
        </GlassCard>
        <section aria-label="Websites">
          <p className="g-muted" style={{ fontSize: 14, marginBottom: 12 }} role="status">
            {r.total} {r.total === 1 ? 'website' : 'websites'} · {hub ? hub.name.replace(/ Websites$/, '') : 'All websites'}
          </p>
          {r.items.length ? (
            <div className="g-grid3">
              {r.items.map((p) => (
                <WebsiteCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <GlassCard>
              <h2>Nothing matches yet</h2>
              <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
                Try fewer filters, or see every website.
              </p>
              <div style={{ marginTop: 14 }}>
                <Button variant="ghost" href="/websites">
                  Clear filters
                </Button>
              </div>
            </GlassCard>
          )}
          {r.pages > 1 && (
            <nav className="g-pager" aria-label="Pages">
              {Array.from({ length: r.pages }, (_, i) => i + 1).map((n) => (
                <Link key={n} className="g-chip" href={browseHref(q, { page: n })} aria-current={n === r.page ? 'true' : undefined}>
                  {n}
                </Link>
              ))}
            </nav>
          )}
        </section>
      </div>
      <PageExtras path="/websites" />
    </>
  );
}
