import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { auditList } from '@/lib/admin/audit';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Audit log', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Audit() {
  const viewer = await requireViewer({ path: '/dashboard/admin/audit', roles: ['admin'] });
  const log = await auditList(200);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-audit" title="Audit log">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>What admins did</h2>
            <p className="sub">Every admin action, newest first. Nobody can edit or delete this list.</p>
          </div>
        </div>
        {log.length === 0 && <p className="muted">Nothing yet.</p>}
        {log.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table stack">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>On</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id}>
                    <td data-label="When">{new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td data-label="Who">{e.adminId ? e.adminId.slice(0, 8) : 'system'}</td>
                    <td data-label="What">{e.action.replace(/_/g, ' ')}</td>
                    <td data-label="On">
                      {e.targetType} {e.targetRef.slice(0, 16)}
                    </td>
                    <td data-label="Details">
                      <code style={{ fontSize: '.8rem' }}>{JSON.stringify(e.detail).slice(0, 160)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashShell>
  );
}
