import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { requireViewer } from '@/lib/supabase/viewer';
import { checklist } from '@/lib/repoAccess';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Repository access'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

export default async function RepoAccess() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/listings/repo', roles: ['admin'], scope: 'delivery' });
  const list = await checklist();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-repo" title={tx('Repository access')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Access to take back ({length})'} v={{ length: list.length }} />
            </h2>
            <p className="tag">
              <T
                s={
                  'An order delivered by GitHub invite was refunded or cancelled after the invite went out. The seller removes the buyer from the private repository and says so; then you check and confirm. There is no GitHub automation yet. Items where the seller says it is done come first.'
                }
              />
            </p>
          </div>
        </div>
        {list.length === 0 && (
          <p className="muted">
            <T s={'Nothing to do.'} />
          </p>
        )}
        {list.map((c) => (
          <div className="sob-item" key={c.orderId}>
            <b>{c.title}</b>{' '}
            <small className="muted">
              <T s={'GitHub user {v0} · order {outcome} · asked {v2} UTC'} v={{ v0: c.github || 'unknown', outcome: c.outcome, v2: when(c.requestedAt) }} />
            </small>{' '}
            <span className={c.state === 'seller_done' ? 'status st-wait' : 'status st-bad'}>
              <i />
              {c.state === 'seller_done' ? tx('Seller says it is done') : tx('Waiting for the seller')}
            </span>
            <p>
              <Link className="" href={`/orders/${c.orderId}`}>
                <T s={'Open the order'} />
              </Link>
            </p>
            <AdminForm
              endpoint={`/api/admin/repo/${c.orderId}`}
              fixed={{ action: 'confirm' }}
              fields={[{ name: 'note', label: tx('How you checked that the access is gone (goes in the audit log)'), kind: 'textarea', required: true }]}
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
