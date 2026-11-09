import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { changedKeys, revisionsOf } from '@/lib/cms/history';
import { trackedKey } from '@/lib/cms/rules';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Site history', robots: { index: false } };
export const dynamic = 'force-dynamic';

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const preview = (v: unknown) => {
  if (v === null || v === undefined) return 'Built-in version (nothing saved)';
  const s = JSON.stringify(v);
  return s.length > 600 ? s.slice(0, 600) + '…' : s;
};

/* Every save of the site builder and SEO settings, numbered per setting; any older revision can be put back (lib/cms). */
export default async function SiteHistory({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/content/site/history', roles: ['admin'], scope: 'content' });
  const { key } = await searchParams;
  const t = key ? trackedKey(key) : null;
  const keys = await changedKeys();
  const revs = t && key ? await revisionsOf(key) : [];
  const current = revs[0]?.version;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-site-history" title="Site history">
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>Site history</h2>
            <p className="tag">
              Each save of the menu, footer, home sections, page blocks and SEO settings is kept. Putting an older one back runs the same checks as a save and adds a new entry; nothing is erased.
            </p>
          </div>
        </div>
        {keys.length === 0 ? (
          <p className="muted">Nothing has been changed since the history started.</p>
        ) : (
          <ul className="sob-list" data-history-keys>
            {keys.map((k) => (
              <li key={k.key}>
                <Link href={`/admin/content/site/history?key=${encodeURIComponent(k.key)}`}>{trackedKey(k.key)?.label ?? k.key}</Link> · revision {k.version} · {when(k.at)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {t && key && (
        <div className="glass card sob-sec" data-history={key}>
          <div className="row sob-hd">
            <div>
              <h2>{t.label}</h2>
              <p className="tag">Newest first. The top one is what the site shows now.</p>
            </div>
          </div>
          <ul className="sob-list">
            {revs.map((r) => (
              <li key={r.id} data-rev={r.version}>
                <div className="sob-grow">
                  <b>
                    Revision {r.version}
                    {r.version === current ? ' (current)' : ''}
                  </b>{' '}
                  · {when(r.at)} · {r.action === 'rollback' ? `put back revision ${r.fromVersion}` : 'saved'}
                  <pre className="muted" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>
                    {preview(r.value)}
                  </pre>
                </div>
                {r.version !== current && (
                  <AdminForm endpoint="/api/admin/cms/history" fixed={{ key, version: r.version }} fields={[]} openLabel="Put this back" submit={`Put revision ${r.version} back`} tone="line" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashShell>
  );
}
