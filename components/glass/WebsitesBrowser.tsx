import Link from 'next/link';
import { WebsiteCard } from './WebsiteCard';
import { pkgOffered } from '@/lib/data';
import { browse, readQuery, SORTS, SORT_LABEL, type BrowseQuery } from '@/lib/glass/browse';
import { CATEGORY_SLUGS, publicWebsites, websiteCategories } from '@/lib/glass/catalog';
import { rankWebsites } from '@/lib/glass/search';
import { HUBS } from '@/lib/seo/hubs';

type Raw = Record<string, string | string[] | undefined>;
const many = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? [v] : [])
    .flatMap((x) => x.split(','))
    .filter(Boolean)
    .slice(0, 12);
const INCLUDES = [
  ['demo', 'Live demo'],
  ['custom', 'Customization by seller'],
] as const;

/*
 * The browse area of design-reference/websites.html: the filter sidebar (category, technology, price, backend, rating, includes), the count and
 * sort, the cards and the pages. Every filter is in the address (a GET form), so it works without JavaScript and every view can be linked.
 * The smart search ranks the words when there are some (lib/glass/search.ts). `category` fixes the category on a category page.
 */
export async function WebsitesBrowser({ raw, category }: { raw: Raw; category?: string }) {
  const q: BrowseQuery = { ...readQuery(raw, CATEGORY_SLUGS), ...(category ? { category } : {}) };
  const tech = many(raw.tech);
  const inc = many(raw.inc).filter((x) => INCLUDES.some(([k]) => k === x));
  const [sites, cats] = await Promise.all([publicWebsites(), websiteCategories()]);
  const parts = (s?: string | null) => (s ?? '').split(/\s*[+,/]\s*/).filter(Boolean);
  const count = (pick: (p: string[]) => string[]) => {
    const m = new Map<string, number>();
    for (const p of sites) for (const t of pick(parts(p.stack))) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  };
  const front = count((p) => p.slice(0, 1)).slice(0, 6);
  const back = count((p) => p.slice(1))
    .filter((t) => !front.includes(t))
    .slice(0, 6);
  const filtered = sites.filter((p) => (!tech.length || tech.some((t) => parts(p.stack).includes(t))) && (!inc.includes('demo') || !!p.demo) && (!inc.includes('custom') || pkgOffered(p, 'custom')));
  const r = browse(filtered, q, (p) => cats.of(p)?.slug ?? null, q.q ? await rankWebsites(q.q) : undefined);
  const hub = HUBS.find((h) => h.slug === q.category);
  const href = (change: Partial<BrowseQuery>) => {
    const n = { ...q, page: 1, ...change };
    const s = new URLSearchParams();
    if (n.q) s.set('q', n.q);
    if (n.category) s.set('category', n.category);
    if (n.min !== null) s.set('min', String(n.min));
    if (n.max !== null) s.set('max', String(n.max));
    if (n.rated) s.set('rated', '1');
    if (n.sort !== 'featured') s.set('sort', n.sort);
    if (tech.length) s.set('tech', tech.join(','));
    if (inc.length) s.set('inc', inc.join(','));
    if (n.page > 1) s.set('page', String(n.page));
    return `/websites${s.size ? `?${s}` : ''}`;
  };
  const check = (name: string, value: string, on: boolean, label: string) => (
    <label key={name + value} className="check">
      <input type="checkbox" name={name} value={value} defaultChecked={on} /> {label}
    </label>
  );
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <aside className="glass sob-filters" style={{ flex: '1 1 240px', maxWidth: 280, padding: '22px 14px', boxSizing: 'border-box' }} aria-label="Filters">
        <div style={{ fontSize: 18, padding: '0 12px' }}>Filters</div>
        <div className="flabel" style={{ padding: '0 12px' }}>
          Category
        </div>
        <Link className={q.category ? 'fopt' : 'fopt on'} href={href({ category: '' })} prefetch={false} aria-current={q.category ? undefined : 'page'}>
          All websites
        </Link>{' '}
        {HUBS.map((h) => (
          <Link key={h.slug} className={q.category === h.slug ? 'fopt on' : 'fopt'} href={href({ category: h.slug })} prefetch={false} aria-current={q.category === h.slug ? 'page' : undefined}>
            {h.name.replace(/ Websites$/, '')}
          </Link>
        ))}
        <form action="/websites" method="get">
          {q.q && <input type="hidden" name="q" value={q.q} />}
          {q.category && <input type="hidden" name="category" value={q.category} />}
          {q.sort !== 'featured' && <input type="hidden" name="sort" value={q.sort} />}
          {front.length > 0 && (
            <>
              <div className="flabel" style={{ padding: '0 12px' }}>
                Technology
              </div>
              {front.map((t) => check('tech', t, tech.includes(t), t))}
            </>
          )}
          <div className="flabel" style={{ padding: '0 12px' }}>
            Price
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 12px' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="pmin" className="tag" style={{ display: 'block', marginBottom: 4 }}>
                Min
              </label>
              <input id="pmin" name="min" className="input" inputMode="decimal" defaultValue={q.min ?? ''} placeholder="$" />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="pmax" className="tag" style={{ display: 'block', marginBottom: 4 }}>
                Max
              </label>
              <input id="pmax" name="max" className="input" inputMode="decimal" defaultValue={q.max ?? ''} placeholder="$" />
            </div>
          </div>
          {back.length > 0 && (
            <>
              <div className="flabel" style={{ padding: '0 12px' }}>
                Backend &amp; database
              </div>
              {back.map((t) => check('tech', t, tech.includes(t), t))}
            </>
          )}
          <div className="flabel" style={{ padding: '0 12px' }}>
            Rating
          </div>
          {check('rated', '1', q.rated, '4 stars and up')}
          <div className="flabel" style={{ padding: '0 12px' }}>
            Includes
          </div>
          {INCLUDES.map(([k, l]) => check('inc', k, inc.includes(k), l))}
          <div style={{ padding: '14px 12px 0' }}>
            <button className="btn ghost" type="submit" style={{ width: '100%' }}>
              Apply filters
            </button>
          </div>
        </form>
      </aside>
      <div style={{ flex: '999 1 560px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 14 }} role="status">
            {r.total} {r.total === 1 ? 'website' : 'websites'} · {hub ? hub.name.replace(/ Websites$/, '') : 'All websites'}
          </div>
          <form action="/websites" method="get" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#3D5563' }}>
            {Object.entries({
              q: q.q,
              category: q.category,
              min: q.min ?? '',
              max: q.max ?? '',
              rated: q.rated ? '1' : '',
              tech: tech.join(','),
              inc: inc.join(','),
            })
              .filter(([, v]) => v !== '')
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={String(v)} />
              ))}
            <label htmlFor="sort">Sort</label>
            <select id="sort" name="sort" className="input" defaultValue={q.sort} style={{ width: 'auto', minWidth: 160, borderRadius: 999 }}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
            <button className="btn sm ghost" type="submit">
              Sort
            </button>
          </form>
        </div>
        {r.items.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: 18 }}>
            {r.items.map((p) => (
              <WebsiteCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="glass card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 22 }}>Nothing matches yet</h2>
            <p className="muted" style={{ margin: '8px 0 14px', fontSize: 14 }}>
              Try fewer filters, or see every website.
            </p>
            <Link className="btn ghost" href="/websites" prefetch={false}>
              Clear filters
            </Link>
          </div>
        )}
        {r.pages > 1 && (
          <nav aria-label="Pages" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 32 }}>
            {Array.from({ length: r.pages }, (_, i) => i + 1).map((n) => (
              <Link key={n} className={n === r.page ? 'pg on' : 'pg'} href={href({ page: n })} prefetch={false} aria-current={n === r.page ? 'page' : undefined}>
                {n}
              </Link>
            ))}
            {r.page < r.pages && (
              <Link className="pg" href={href({ page: r.page + 1 })} prefetch={false} aria-label="Next page">
                ›
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
