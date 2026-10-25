import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchMark } from '@/components/SearchMark';
import { siteSearch } from '@/lib/siteSearch';
import { KINDS, KIND_LABEL, MAX_QUERY, MIN_QUERY, type Kind } from '@/lib/siteSearchCore';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };

/* Every result for a search across the whole site, grouped by kind; ?kind= narrows to one kind. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const sp = await searchParams;
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, MAX_QUERY);
  const only = KINDS.find((k) => k === sp.kind);
  const hits = q.length >= MIN_QUERY ? await siteSearch(q) : [];
  const count = (k: Kind) => hits.filter((h) => h.kind === k).length;
  const shown = only ? hits.filter((h) => h.kind === only) : hits;
  const href = (k?: Kind) => `/search?q=${encodeURIComponent(q)}${k ? `&kind=${k}` : ''}`;

  return (
    <div className="wrap ss-page">
      <nav className="crumbs muted" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / Search
      </nav>
      <h1>{q ? <>Results for “{q}”</> : 'Search the site'}</h1>
      <form className="ss-form" action="/search" role="search">
        <label className="sr-only" htmlFor="ss-q">
          Search
        </label>
        <input id="ss-q" name="q" type="search" defaultValue={q} maxLength={MAX_QUERY} placeholder="Products, pages, guides, developers" />
        <button className="btn btn-blue" type="submit">
          Search
        </button>
      </form>
      {q.length > 0 && q.length < MIN_QUERY && <p className="muted">Type at least {MIN_QUERY} letters.</p>}
      {q.length >= MIN_QUERY && (
        <>
          <p className="muted">
            {hits.length === 0 ? 'Nothing found. Try fewer or shorter words.' : `${hits.length} ${hits.length === 1 ? 'result' : 'results'} across products, pages, guides and developers.`}
          </p>
          {hits.length > 0 && (
            <div className="ss-kinds" role="group" aria-label="Show results of one kind">
              <Link href={href()} aria-current={!only ? 'page' : undefined}>
                All <em>{hits.length}</em>
              </Link>
              {KINDS.filter((k) => count(k)).map((k) => (
                <Link key={k} href={href(k)} aria-current={only === k ? 'page' : undefined}>
                  {KIND_LABEL[k]} <em>{count(k)}</em>
                </Link>
              ))}
            </div>
          )}
          {KINDS.filter((k) => shown.some((h) => h.kind === k)).map((k) => (
            <section key={k} className="ss-group" aria-labelledby={`ss-${k}`}>
              <h2 id={`ss-${k}`}>{KIND_LABEL[k]}</h2>
              <ul>
                {shown
                  .filter((h) => h.kind === k)
                  .map((h) => (
                    <li key={h.href + h.title}>
                      <a href={h.href} className="ss-hit">
                        <b>
                          <SearchMark text={h.title} q={q} />
                        </b>
                        {h.sub && <small>{h.sub}</small>}
                        {h.snippet && (
                          <span>
                            <SearchMark text={h.snippet} q={q} />
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
