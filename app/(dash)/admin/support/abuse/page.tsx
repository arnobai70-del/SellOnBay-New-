import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { listReports } from '@/lib/admin/queue';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Abuse reports'), robots: { index: false } });
export const dynamic = 'force-dynamic';

export default async function Abuse() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/support/abuse', roles: ['admin'], scope: 'support' });
  const reports = await listReports(true);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-abuse" title={tx('Abuse reports')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Open reports'} />
            </h2>
            <p className="tag">
              <T s={'Phishing, copies, malware. Suspending pauses the listing the link points to. Look at the page before you decide.'} />
            </p>
          </div>
        </div>
        {reports.length === 0 && (
          <p className="muted">
            <T s={'No open reports.'} />
          </p>
        )}
        {reports.map((r) => (
          <div className="sob-item" key={r.id}>
            <h3>{r.url}</h3>
            <p>{r.reason}</p>
            <small className="muted">
              {new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {r.slug ? ` · listing ${r.slug} · ${r.reporters} different ${r.reporters === 1 ? 'reporter' : 'reporters'}, ${r.verifiedReporters} verified` : tx(' · not a listing on this site')}
            </small>
            <AdminForm
              endpoint={`/api/admin/abuse/${r.id}/decide`}
              openLabel="Decide"
              submit="Save decision"
              tone="gold"
              fields={[
                {
                  name: 'decision',
                  label: tx('Decision'),
                  kind: 'select',
                  options: [
                    ['suspend', 'Suspend the site'],
                    ['dismiss', 'Dismiss the report'],
                    ['reinstate', 'Put the site back (it was paused)'],
                  ],
                },
                { name: 'note', label: tx('Note'), kind: 'textarea' },
              ]}
            />
          </div>
        ))}
      </div>
    </DashShell>
  );
}
