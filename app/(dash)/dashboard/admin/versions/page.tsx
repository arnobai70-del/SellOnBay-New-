import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { requireViewer } from '@/lib/supabase/viewer';
import { reviewQueue } from '@/lib/versions';

export const metadata: Metadata = { title: 'New versions', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Versions() {
  const viewer = await requireViewer({ path: '/dashboard/admin/versions', roles: ['admin'] });
  const list = await reviewQueue();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-versions" title="New versions">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Waiting for review ({list.length})</h2>
            <p className="sub">
              A seller published a new version of a live digital product. Open the new files in a sandbox, then approve or reject. Approving tells every buyer whose update period is still running.
            </p>
          </div>
        </div>
        {list.length === 0 && <p className="muted">Nothing is waiting.</p>}
        {list.map((v) => (
          <div className="adm-card" key={v.id}>
            <b>
              {v.title} {v.version}
            </b>{' '}
            <small className="muted">{new Date(v.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC</small>
            <p style={{ whiteSpace: 'pre-line' }}>{v.changelog}</p>
            <p>
              <a className="link-u" href={v.fileUrl} target="_blank" rel="noopener noreferrer nofollow">
                Open the new files
              </a>
            </p>
            <AdminForm
              endpoint={`/api/admin/versions/${v.id}/decide`}
              openLabel="Decide"
              submit="Save decision"
              tone="dark"
              fields={[
                {
                  name: 'decision',
                  label: 'Decision',
                  kind: 'select',
                  options: [
                    ['approve', 'Approve and tell the buyers'],
                    ['reject', 'Reject'],
                  ],
                },
                { name: 'note', label: 'Note for the seller (needed to reject)', kind: 'textarea' },
                { name: 'filesChecked', label: 'I opened the new files in a sandbox and they are clean (needed to approve)', kind: 'checkbox' },
              ]}
            />
          </div>
        ))}
      </div>
    </DashShell>
  );
}
