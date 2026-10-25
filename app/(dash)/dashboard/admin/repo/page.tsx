import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { requireViewer } from '@/lib/supabase/viewer';
import { checklist } from '@/lib/repoAccess';

export const metadata: Metadata = { title: 'Repository access', robots: { index: false } };
export const dynamic = 'force-dynamic';

const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

export default async function RepoAccess() {
  const viewer = await requireViewer({ path: '/dashboard/admin/repo', roles: ['admin'] });
  const list = await checklist();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-repo" title="Repository access">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Access to take back ({list.length})</h2>
            <p className="sub">
              An order delivered by GitHub invite was refunded or cancelled after the invite went out. The seller removes the buyer from the private repository and says so; then you check and confirm.
              There is no GitHub automation yet. Items where the seller says it is done come first.
            </p>
          </div>
        </div>
        {list.length === 0 && <p className="muted">Nothing to do.</p>}
        {list.map((c) => (
          <div className="adm-card" key={c.orderId}>
            <b>{c.title}</b>{' '}
            <small className="muted">
              GitHub user {c.github || 'unknown'} · order {c.outcome} · asked {when(c.requestedAt)} UTC
            </small>{' '}
            <span className={c.state === 'seller_done' ? 'chip amber' : 'chip rose'}>
              <i />
              {c.state === 'seller_done' ? 'Seller says it is done' : 'Waiting for the seller'}
            </span>
            <p>
              <Link className="link-u" href={`/orders/${c.orderId}`}>
                Open the order
              </Link>
            </p>
            <AdminForm
              endpoint={`/api/admin/repo/${c.orderId}`}
              fixed={{ action: 'confirm' }}
              fields={[{ name: 'note', label: 'How you checked that the access is gone (goes in the audit log)', kind: 'textarea', required: true }]}
              submit="Confirm removed"
              openLabel="Confirm removed"
              tone="dark"
            />
            {c.state === 'pending' && (
              <AdminForm endpoint={`/api/admin/repo/${c.orderId}`} fixed={{ action: 'remind' }} fields={[]} submit="Remind the seller" openLabel="Remind the seller" tone="line" />
            )}
          </div>
        ))}
      </div>
    </DashShell>
  );
}
