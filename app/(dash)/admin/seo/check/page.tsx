import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { seoFindings } from '@/lib/seo/check';
import { seoRows } from '@/lib/seo/report';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'SEO check', robots: { index: false } };
export const dynamic = 'force-dynamic';

const KIND = { page: 'Page', topic: 'Topic', listing: 'Listing' } as const;

/* The automatic check: every page, topic and live listing, with what Google is given and what to fix. Worst first. */
export default async function SeoCheck() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/seo/check', roles: ['admin'], scope: 'content' });
  const rows = await seoRows();
  const found = seoFindings(rows);
  const score = (path: string) => (found.get(path) ?? []).reduce((n, f) => n + (f.level === 'fix' ? 10 : 1), 0);
  const sorted = [...rows].sort((a, b) => score(b.path) - score(a.path));
  const fixes = rows.filter((r) => found.get(r.path)?.some((f) => f.level === 'fix')).length;
  const tips = rows.filter((r) => found.get(r.path)?.length && !found.get(r.path)?.some((f) => f.level === 'fix')).length;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={tx('SEO check')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Every page, topic and listing'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Checked just now: {length} addresses (pages, topics and live listings). {fixes} to fix, {tips} that could be better, {v3} look good. The check looks at missing, too long, too short and repeated titles and descriptions.'
                }
                v={{ length: rows.length, fixes, tips, v3: rows.length - fixes - tips }}
              />
            </p>
          </div>
          <Link className="btn ghost sm" href="/admin/seo">
            <T s={'Back to SEO and blog'} />
          </Link>
        </div>
        <ul className="sob-list">
          {sorted.map((r) => {
            const f = found.get(r.path) ?? [];
            const fix = f.some((x) => x.level === 'fix');
            return (
              <li key={r.path}>
                <div className="sob-grow">
                  <b>
                    {KIND[r.kind]}: {r.name}
                  </b>
                  <small>{r.title}</small>
                  {f.length ? (
                    f.map((x) => <small key={x.text}>{x.text}</small>)
                  ) : (
                    <small>
                      <T s={'Looks good.'} />
                    </small>
                  )}
                </div>
                <span className={fix ? 'status st-bad' : f.length ? 'status st-wait' : 'status st-ok'}>
                  <i />
                  {fix ? tx('Fix') : f.length ? tx('Improve') : tx('Good')}
                </span>
                {f.length > 0 && (
                  <Link className="btn ghost sm" href={`/admin/seo/pages/edit?path=${encodeURIComponent(r.path)}`}>
                    <T s={'Edit'} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </DashShell>
  );
}
