import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { listUsers } from '@/lib/admin/queue';
import { adminScopeList } from '@/lib/admin/scopeStore';
import { SCOPES, SCOPE_LABEL } from '@/lib/admin/scopes';
import { supabaseConfigured } from '@/lib/supabase/env';
import { pendingDeletions } from '@/lib/privacy';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Accounts', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const viewer = await requireViewer({ path: '/admin/users/accounts', roles: ['admin'], scope: 'super' });
  const { q } = await searchParams;
  // ?q=a&q=b arrives as a list; search for nothing rather than crash.
  const users = await listUsers(typeof q === 'string' ? q : '');
  const deletions = await pendingDeletions();
  const scopes = supabaseConfigured ? await adminScopeList() : null;
  const now = Date.now();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-users" title="Accounts">
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>Accounts</h2>
            <p className="tag">Ban, unban, lift a suspension or clear a flag. Every action needs a reason and goes in the audit log.</p>
          </div>
        </div>
        {deletions.length > 0 && (
          <div className="sob-item">
            <h3>Deletion requests ({deletions.length})</h3>
            <p className="muted">Processing anonymises the account and locks the sign-in. It is refused while an order, a dispute or a payout is open, and the person sees why.</p>
            {deletions.map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>
                  {d.name}{' '}
                  <small className="muted">
                    {d.userId.slice(0, 8)} · {new Date(d.createdAt).toLocaleDateString('en-US')}
                  </small>
                </span>
                <AdminForm endpoint={`/api/admin/privacy/${d.id}/process`} fields={[]} submit="Process deletion" openLabel="Process" tone="dark" />
              </div>
            ))}
          </div>
        )}
        <form method="get" style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
          <label className="hidden-label" htmlFor="uq">
            Search by name
          </label>
          <input id="uq" name="q" defaultValue={q ?? ''} placeholder="Search by name" />
          <button className="btn ghost sm" type="submit">
            Search
          </button>
        </form>
        {users.length === 0 && <p className="muted">No accounts to show.</p>}
        {users.length > 0 && (
          <div className="tbl">
            <table className="sob-stack">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>State</th>
                  <th>Strikes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Name">
                      {u.name}
                      <br />
                      <small className="muted">{u.id.slice(0, 8)}</small>
                    </td>
                    <td data-label="Role">
                      {u.role}
                      {u.role === 'admin' && scopes?.get(u.id) && (
                        <>
                          <br />
                          <small className="muted" data-scopes>
                            {scopes
                              .get(u.id)!
                              .map((s) => SCOPE_LABEL[s])
                              .join(', ')}
                          </small>
                        </>
                      )}
                    </td>
                    <td data-label="State">
                      {u.banned ? 'banned' : u.suspendedUntil && u.suspendedUntil > now ? `suspended until ${new Date(u.suspendedUntil).toISOString().slice(0, 10)}` : 'active'}
                      {u.flagged ? ', flagged' : ''}
                    </td>
                    <td data-label="Strikes">{u.strikes}</td>
                    <td data-label="Action">
                      <AdminForm
                        endpoint={`/api/admin/users/${u.id}/action`}
                        openLabel="Act"
                        submit="Do it"
                        tone="line"
                        fields={[
                          {
                            name: 'action',
                            label: 'Action',
                            kind: 'select',
                            options: [
                              ['ban', 'Ban'],
                              ['unban', 'Unban'],
                              ['unsuspend', 'Lift the suspension'],
                              ['clear_flag', 'Clear the flag'],
                            ],
                          },
                          { name: 'note', label: 'Why (goes in the audit log)', kind: 'textarea', required: true },
                        ]}
                      />
                      {u.role === 'admin' && scopes && u.id !== viewer?.id && (
                        <AdminForm
                          endpoint={`/api/admin/users/${u.id}/scopes`}
                          openLabel="Permissions"
                          submit="Save permissions"
                          tone="line"
                          fields={[
                            {
                              name: 'scopes',
                              label: `Permissions, separated by commas (${SCOPES.join(', ')})`,
                              kind: 'text',
                              value: (scopes.get(u.id) ?? []).join(', '),
                              required: true,
                            },
                            { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea', required: true },
                          ]}
                        />
                      )}
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
