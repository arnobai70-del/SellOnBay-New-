import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { seoFindings } from '@/lib/seo/check';
import { seoRows } from '@/lib/seo/report';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'SEO check', robots: { index: false } };
export const dynamic = 'force-dynamic';

const KIND = { page: 'Page', topic: 'Topic', listing: 'Listing' } as const;

/* The automatic check: every page, topic and live listing, with what Google is given and what to fix. Worst first. */
export default async function SeoCheck() {
  const viewer = await requireViewer({ path: '/dashboard/admin/seo/check', roles: ['admin'] });
  const rows = await seoRows();
  const found = seoFindings(rows);
  const score = (path: string) => (found.get(path) ?? []).reduce((n, f) => n + (f.level === 'fix' ? 10 : 1), 0);
  const sorted = [...rows].sort((a, b) => score(b.path) - score(a.path));
  const fixes = rows.filter((r) => found.get(r.path)?.some((f) => f.level === 'fix')).length;
  const tips = rows.filter((r) => found.get(r.path)?.length && !found.get(r.path)?.some((f) => f.level === 'fix')).length;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title="SEO check">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Every page, topic and listing</h2>
            <p className="sub">
              Checked just now: {rows.length} addresses (pages, topics and live listings). {fixes} to fix, {tips} that could be better, {rows.length - fixes - tips} look good. The check looks at
              missing, too long, too short and repeated titles and descriptions.
            </p>
          </div>
          <Link className="btn btn-line btn-sm" href="/dashboard/admin/seo">
            Back to SEO and blog
          </Link>
        </div>
        <ul className="lst">
          {sorted.map((r) => {
            const f = found.get(r.path) ?? [];
            const fix = f.some((x) => x.level === 'fix');
            return (
              <li key={r.path}>
                <div className="grow">
                  <b>
                    {KIND[r.kind]}: {r.name}
                  </b>
                  <small>{r.title}</small>
                  {f.length ? f.map((x) => <small key={x.text}>{x.text}</small>) : <small>Looks good.</small>}
                </div>
                <span className={fix ? 'chip rose' : f.length ? 'chip amber' : 'chip mint'}>
                  <i />
                  {fix ? 'Fix' : f.length ? 'Improve' : 'Good'}
                </span>
                {f.length > 0 && (
                  <Link className="btn btn-line btn-sm" href={`/dashboard/admin/seo/pages/edit?path=${encodeURIComponent(r.path)}`}>
                    Edit
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
