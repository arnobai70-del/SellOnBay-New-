import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { hasScope } from '@/lib/admin/scopes';
import { listQuotes, listRequests } from '@/lib/requests/store';
import { REQUEST_WORDS, personNames, productNames, requestTitle, usd } from '@/lib/requests/view';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Purchase requests'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const age = (ms: number) => {
  const h = Math.floor((Date.now() - ms) / 3_600_000);
  return h < 1 ? 'under an hour' : h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
};

/* Support and Catalog work through purchase requests; a Super Admin approves any quotation whose price differs from the listed price (O-8). */
export default async function Requests() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
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
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-requests" title={tx('Purchase requests')}>
      {pendingSuper.length > 0 && (
        <div className="glass card sob-sec" data-super-queue>
          <div className="row sob-hd">
            <div>
              <h2>
                <T s={'Price changes waiting for Super Admin ({length})'} v={{ length: pendingSuper.length }} />
              </h2>
              <p className="tag">
                <T s={'These quotations differ from the listed price. They reach the buyer only after approval.'} />
              </p>
            </div>
          </div>
          <ul className="sob-list">
            {pendingSuper.map((q) => (
              <li key={q.id}>
                <div className="sob-grow">
                  <b>
                    <Link href={`/admin/orders/requests/${q.requestId}`}>
                      <T s={'Quotation v{version}'} v={{ version: q.version }} />
                    </Link>
                    <T s={': {v0} (listed {v1})'} v={{ v0: usd(q.totalCents), v1: q.listedCents === null ? 'none' : usd(q.listedCents) }} />
                  </b>
                  <small>
                    <T s={'Reason: {overrideReason}'} v={{ overrideReason: q.overrideReason }} />
                  </small>
                  {isSuper ? (
                    <AdminForm
                      endpoint={`/api/admin/quotations/${q.id}`}
                      openLabel="Decide"
                      submit="Save decision"
                      tone="line"
                      fields={[
                        {
                          name: 'action',
                          label: tx('Decision'),
                          kind: 'select',
                          options: [
                            ['approve_override', 'Approve this price and send it to the buyer'],
                            ['decline_override', 'Send it back as a draft'],
                          ],
                        },
                        { name: 'reason', label: tx('Why (goes in the audit log)'), kind: 'textarea', required: true },
                      ]}
                    />
                  ) : (
                    <small className="muted">
                      <T s={'A Super Admin decides this.'} />
                    </small>
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
          {list.length === 0 && (
            <p className="muted">
              <T s={'None.'} />
            </p>
          )}
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
                      <T
                        s={'{v0} · waiting {v1}{v2}'}
                        v={{ v0: buyers.get(r.buyerId) ?? 'Buyer', v1: age(r.updatedAt), v2: r.expiresAt ? ` · expires ${new Date(r.expiresAt).toISOString().slice(0, 10)}` : '' }}
                      />
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
