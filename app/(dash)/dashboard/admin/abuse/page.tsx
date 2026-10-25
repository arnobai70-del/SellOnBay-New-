import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { listReports } from '@/lib/admin/queue';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Abuse reports', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Abuse() {
  const viewer = await requireViewer({ path: '/dashboard/admin/abuse', roles: ['admin'] });
  const reports = await listReports(true);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-abuse" title="Abuse reports">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Open reports</h2>
            <p className="sub">Phishing, copies, malware. Suspending pauses the listing the link points to. Look at the page before you decide.</p>
          </div>
        </div>
        {reports.length === 0 && <p className="muted">No open reports.</p>}
        {reports.map((r) => (
          <div className="adm-card" key={r.id}>
            <h3>{r.url}</h3>
            <p>{r.reason}</p>
            <small className="muted">
              {new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {r.slug ? ` · listing ${r.slug} · ${r.reporters} different ${r.reporters === 1 ? 'reporter' : 'reporters'}, ${r.verifiedReporters} verified` : ' · not a listing on this site'}
            </small>
            <AdminForm
              endpoint={`/api/admin/abuse/${r.id}/decide`}
              openLabel="Decide"
              submit="Save decision"
              tone="gold"
              fields={[
                {
                  name: 'decision',
                  label: 'Decision',
                  kind: 'select',
                  options: [
                    ['suspend', 'Suspend the site'],
                    ['dismiss', 'Dismiss the report'],
                    ['reinstate', 'Put the site back (it was paused)'],
                  ],
                },
                { name: 'note', label: 'Note', kind: 'textarea' },
              ]}
            />
          </div>
        ))}
      </div>
    </DashShell>
  );
}
