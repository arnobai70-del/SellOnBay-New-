import { TopBand } from '@/components/glass/TopBand';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GlassCard } from '@/components/glass/GlassCard';
import { SearchBox } from '@/components/glass/SearchBox';
import { smartSearch, type Result } from '@/lib/glass/search';
import { highlight } from '@/lib/searchCore';

import { getI18n } from '@/lib/i18n/server';
import { T } from '@/components/i18n/T';
export const dynamic = 'force-dynamic';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Search'), robots: { index: false, follow: true } });

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
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
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
    <div className="sob-stack">
      <TopBand title={q ? <T s={'Results for “{q}”'} v={{ q }} /> : tx('Search')}>
        <SearchBox variant="pill" defaultValue={q} maxWidth={640} />
      </TopBand>
      {q.length >= 2 && !r.total && (
        <GlassCard as="section">
          <h2>
            <T s={'No results for “{q}”'} v={{ q }} />
          </h2>
          {r.didYouMean.length > 0 && (
            <p style={{ marginTop: 8 }}>
              <T s={'Did you mean'} />{' '}
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
            <div key={x.href} className="li" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
              <Link href={x.href}>
                <Marked text={x.title} q={q} />
              </Link>
              {x.sub && <span className="tag">{x.sub}</span>}
            </div>
          ))}
        </GlassCard>
      ))}
      <GlassCard as="section">
        <h2>
          <T s={'Popular categories'} />
        </h2>
        <div className="sob-chips" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          {r.popular.map((c) => (
            <Link key={c.href} className="sob-chip" href={c.href}>
              {c.title}
            </Link>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
