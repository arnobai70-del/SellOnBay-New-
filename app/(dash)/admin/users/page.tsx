import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { listUsers, type UserRow } from '@/lib/admin/queue';
import { hasScope } from '@/lib/admin/scopes';
import { COUNTRY_NAME } from '@/lib/countries';
import { shortDate } from '@/lib/glass/orderStatus';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Users and roles', robots: { index: false } };
export const dynamic = 'force-dynamic';

const DOC: Record<string, string> = { passport: 'Passport', national_id: 'National ID card', driver_licence: 'Driver licence' };
type Check = { id: string; seller_id: string; doc_type: string; country: string; back_path: string | null; created_at: string };

/*
 * Accounts (find, ban, unban; Super Admin) and the sellers' identity checks (Finance only, owner 2026-11-07). A document opens through a 5-minute link
 * and every opening is audited. Permissions of admin accounts are set on the full tool.
 */
export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/users', roles: ['admin'], scope: ['super', 'finance'] });
  const q = ((await searchParams).q ?? '').slice(0, 60);
  const scopes = viewer?.scopes ?? ['super'];
  const finance = hasScope(scopes, 'finance');
  const superAdmin = scopes.includes('super');
  const [users, checks] = await Promise.all([
    superAdmin ? listUsers(q) : Promise.resolve([] as UserRow[]),
    finance && supabaseConfigured
      ? createAdminClient().from('seller_verifications').select('id, seller_id, doc_type, country, back_path, created_at').eq('status', 'pending').order('created_at').limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  const pending = (checks.data ?? []) as Check[];
  const names = new Map<string, string>();
  if (pending.length && supabaseConfigured) {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('id, full_name')
      .in(
        'id',
        pending.map((c) => c.seller_id),
      );
    for (const p of data ?? []) names.set(p.id, p.full_name || 'Seller');
  }
  return (
    <AdminShell viewer={viewer} active="users" title="Users & roles" subtitle="Accounts, bans and the sellers' identity checks">
      {finance && (
        <GlassCard as="section" id="verify">
          <h2>Identity checks ({pending.length})</h2>
          <p className="g-tag">Only Finance sees these. Each document opens for 5 minutes and the opening is logged.</p>
          {pending.length ? (
            pending.map((c) => (
              <div key={c.id} className="g-li" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
                <span>
                  <b>{names.get(c.seller_id) ?? 'Seller'}</b> · {DOC[c.doc_type] ?? c.doc_type} · {COUNTRY_NAME[c.country] ?? c.country} · sent {shortDate(Date.parse(c.created_at))}
                </span>
                <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <a href={`/api/admin/verifications/${c.id}/file?side=front`} target="_blank" rel="noopener noreferrer">
                    Open front
                  </a>
                  {c.back_path && (
                    <a href={`/api/admin/verifications/${c.id}/file?side=back`} target="_blank" rel="noopener noreferrer">
                      Open back
                    </a>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <ActionButton endpoint={`/api/admin/verifications/${c.id}`} label="Approve" body={{ decision: 'approve' }} />
                  <ActionButton endpoint={`/api/admin/verifications/${c.id}`} label="Reject" tone="line" body={{ decision: 'reject' }} note={{ label: 'Reason for the seller', required: true }} />
                </div>
              </div>
            ))
          ) : (
            <p className="g-muted" style={{ marginTop: 8 }}>
              Nothing waiting.
            </p>
          )}
        </GlassCard>
      )}
      {superAdmin && (
        <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
          <div style={{ padding: '0 14px 6px' }}>
            <h2>Accounts</h2>
            <form action="/admin/users" method="get" className="g-row" style={{ justifyContent: 'flex-start', marginTop: 8 }} role="search">
              <label className="g-sr" htmlFor="user-q">
                Find by name
              </label>
              <input id="user-q" className="g-input" name="q" defaultValue={q} placeholder="Find by name" style={{ maxWidth: 260 }} />
              <button className="g-btn g-btn-ghost g-btn-sm" type="submit">
                Find
              </button>
            </form>
          </div>
          <DataTable<UserRow>
            caption="Accounts"
            rows={users}
            rowKey={(u) => u.id}
            empty="No accounts found."
            columns={[
              { key: 'name', label: 'Name', cell: (u) => u.name },
              { key: 'role', label: 'Role', cell: (u) => u.role },
              { key: 'since', label: 'Joined', cell: (u) => shortDate(u.createdAt) },
              {
                key: 'state',
                label: 'State',
                cell: (u) => (u.banned ? <StatusPill tone="bad">Banned</StatusPill> : u.flagged ? <StatusPill tone="wait">Flagged</StatusPill> : <StatusPill tone="ok">Active</StatusPill>),
              },
              {
                key: 'act',
                label: 'Actions',
                hideLabel: true,
                cell: (u) =>
                  u.id === viewer?.id ? null : (
                    <AdminForm
                      endpoint={`/api/admin/users/${u.id}/action`}
                      openLabel="Act"
                      submit="Save"
                      tone="line"
                      fields={[
                        {
                          name: 'action',
                          label: 'What to do',
                          kind: 'select',
                          options: [
                            [u.banned ? 'unban' : 'ban', u.banned ? 'Unban' : 'Ban'],
                            ['unsuspend', 'Lift a suspension'],
                            ['clear_flag', 'Clear the flag'],
                          ],
                        },
                        { name: 'note', label: 'Why (goes in the audit log)', kind: 'textarea', required: true },
                      ]}
                    />
                  ),
              },
            ]}
          />
          <p style={{ padding: '6px 14px 10px' }}>
            <Link href="/dashboard/admin/users">Admin permissions and full account tools</Link>
          </p>
        </GlassCard>
      )}
    </AdminShell>
  );
}
