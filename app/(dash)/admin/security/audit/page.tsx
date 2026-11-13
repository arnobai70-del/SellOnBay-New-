import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { auditList } from '@/lib/admin/audit';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Audit log'), robots: { index: false } });
export const dynamic = 'force-dynamic';

export default async function Audit() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/security/audit', roles: ['admin'], scope: 'super' });
  const log = await auditList(200);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-audit" title={tx('Audit log')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'What admins did'} />
            </h2>
            <p className="tag">
              <T s={'Every admin action, newest first. Nobody can edit or delete this list.'} />
            </p>
          </div>
        </div>
        {log.length === 0 && (
          <p className="muted">
            <T s={'Nothing yet.'} />
          </p>
        )}
        {log.length > 0 && (
          <div className="tbl">
            <table className="sob-stack">
              <thead>
                <tr>
                  <th>
                    <T s={'When'} />
                  </th>
                  <th>
                    <T s={'Who'} />
                  </th>
                  <th>
                    <T s={'What'} />
                  </th>
                  <th>
                    <T s={'On'} />
                  </th>
                  <th>
                    <T s={'Details'} />
                  </th>
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
