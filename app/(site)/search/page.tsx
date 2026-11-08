import type { Metadata } from 'next';
import Link from 'next/link';
import { GlassCard } from '@/components/glass/GlassCard';
import { SearchBox } from '@/components/glass/SearchBox';
import { smartSearch, type Result } from '@/lib/glass/search';
import { legacyPublic } from '@/lib/legacy';
import { highlight } from '@/lib/searchCore';
import { LegacySearch } from './LegacySearch';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };

function Marked({ text, q }: { text: string; q: string }) {
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of highlight(text, q)) {
    if (s > at) out.push(text.slice(at, s));
    out.push(<mark key={s}>{text.slice(s, e)}</mark>);
    at = e;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

/* Every result of the smart search, grouped by type (owner, 2026-11-08). Server-rendered, so it works without JavaScript. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  if (legacyPublic()) return <LegacySearch searchParams={searchParams} />;
  const sp = await searchParams;
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 80);
  const r = await smartSearch(q, 30);
  const groups: [string, Result[]][] = (
    [
      ['Websites', r.websites],
      ['Sellers', r.sellers],
      ['Domains', r.domain ? [r.domain] : []],
      ['Guides', r.guides],
      ['Help', r.help],
    ] as [string, Result[]][]
  ).filter(([, l]) => l.length);
  return (
    <div className="g-stack">
      <div className="g-head">
        <h1>{q ? <>Results for &ldquo;{q}&rdquo;</> : 'Search'}</h1>
        <div className="g-glass g-search">
          <SearchBox defaultValue={q} />
        </div>
      </div>
      {q.length >= 2 && !r.total && (
        <GlassCard as="section">
          <h2>No results for &ldquo;{q}&rdquo;</h2>
          {r.didYouMean.length > 0 && (
            <p style={{ marginTop: 8 }}>
              Did you mean{' '}
              {r.didYouMean.map((s, i) => (
                <span key={s}>
                  {i > 0 && ', '}
                  <Link href={`/search?q=${encodeURIComponent(s)}`}>{s}</Link>
                </span>
              ))}
              ?
            </p>
          )}
          {r.domain && (
            <p style={{ marginTop: 8 }}>
              <Link href={r.domain.href}>{r.domain.title}</Link>
            </p>
          )}
        </GlassCard>
      )}
      {groups.map(([name, list]) => (
        <GlassCard key={name} as="section">
          <h2>
            {name} ({list.length})
          </h2>
          {list.map((x) => (
            <div key={x.href} className="g-li" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
              <Link href={x.href}>
                <Marked text={x.title} q={q} />
              </Link>
              {x.sub && <span className="g-tag">{x.sub}</span>}
            </div>
          ))}
        </GlassCard>
      ))}
      <GlassCard as="section">
        <h2>Popular categories</h2>
        <div className="g-chips" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          {r.popular.map((c) => (
            <Link key={c.href} className="g-chip" href={c.href}>
              {c.title}
            </Link>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
