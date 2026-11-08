import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { hasScope } from '@/lib/admin/scopes';
import { listQuotes, listRequests } from '@/lib/requests/store';
import { REQUEST_WORDS, personNames, productNames, requestTitle, usd } from '@/lib/requests/view';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Purchase requests', robots: { index: false } };
export const dynamic = 'force-dynamic';

const age = (ms: number) => {
  const h = Math.floor((Date.now() - ms) / 3_600_000);
  return h < 1 ? 'under an hour' : h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
};

/* Support and Catalog work through purchase requests; a Super Admin approves any quotation whose price differs from the listed price (O-8). */
export default async function Requests() {
  const viewer = await requireViewer({ path: '/admin/orders/requests', roles: ['admin'], scope: ['support', 'catalog'] });
  const open = await listRequests({ statuses: ['submitted', 'under_review', 'needs_info', 'requirements_verified', 'quoted'] });
  const pendingSuper = await listQuotes(['pending_super']);
  const products = await productNames(open.map((r) => r.productId));
  const buyers = await personNames(open.map((r) => r.buyerId));
  const isSuper = hasScope(viewer?.scopes ?? ['super'], 'super');
  const groups: [string, typeof open][] = [
    ['New', open.filter((r) => r.status === 'submitted')],
    ['Being worked on', open.filter((r) => ['under_review', 'requirements_verified'].includes(r.status))],
    ['Waiting for the buyer', open.filter((r) => ['needs_info', 'quoted'].includes(r.status))],
  ];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-requests" title="Purchase requests">
      {pendingSuper.length > 0 && (
        <div className="glass card sob-sec" data-super-queue>
          <div className="row sob-hd">
            <div>
              <h2>Price changes waiting for Super Admin ({pendingSuper.length})</h2>
              <p className="tag">These quotations differ from the listed price. They reach the buyer only after approval.</p>
            </div>
          </div>
          <ul className="sob-list">
            {pendingSuper.map((q) => (
              <li key={q.id}>
                <div className="sob-grow">
                  <b>
                    <Link href={`/admin/orders/requests/${q.requestId}`}>Quotation v{q.version}</Link>: {usd(q.totalCents)} (listed {q.listedCents === null ? 'none' : usd(q.listedCents)})
                  </b>
                  <small>Reason: {q.overrideReason}</small>
                  {isSuper ? (
                    <AdminForm
                      endpoint={`/api/admin/quotations/${q.id}`}
                      openLabel="Decide"
                      submit="Save decision"
                      tone="line"
                      fields={[
                        {
                          name: 'action',
                          label: 'Decision',
                          kind: 'select',
                          options: [
                            ['approve_override', 'Approve this price and send it to the buyer'],
                            ['decline_override', 'Send it back as a draft'],
                          ],
                        },
                        { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea', required: true },
                      ]}
                    />
                  ) : (
                    <small className="muted">A Super Admin decides this.</small>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups.map(([title, list]) => (
        <div className="glass card sob-sec" key={title}>
          <div className="row sob-hd">
            <div>
              <h2>
                {title} ({list.length})
              </h2>
            </div>
          </div>
          {list.length === 0 && <p className="muted">None.</p>}
          <ul className="sob-list">
            {list.map((r) => {
              const [word, chip] = REQUEST_WORDS[r.status] ?? [r.status, 'status st-draft'];
              return (
                <li key={r.id}>
                  <div className="sob-grow">
                    <b>
                      <Link href={`/admin/orders/requests/${r.id}`}>{requestTitle(r, products)}</Link>
                    </b>
                    <small>
                      {buyers.get(r.buyerId) ?? 'Buyer'} · waiting {age(r.updatedAt)}
                      {r.expiresAt ? ` · expires ${new Date(r.expiresAt).toISOString().slice(0, 10)}` : ''}
                    </small>
                  </div>
                  <span className={chip}>
                    <i />
                    {word}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </DashShell>
  );
}
