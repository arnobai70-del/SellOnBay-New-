import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { SlaClock } from '@/components/SlaClock';
import { CONFIG } from '@/lib/config';
import { getOrder } from '@/lib/orders/service';
import { allowanceLeft, KIND_TEXT } from '@/lib/revisions/rules';
import { revisionSummary } from '@/lib/revisions/service';
import { proposedPolicies, revisionsFor } from '@/lib/revisions/store';
import { requestableProduct } from '@/lib/requests/products';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Revisions', robots: { index: false } };
export const dynamic = 'force-dynamic';

const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const usd = (c: number | null) => (c === null ? 'quoted each time' : `$${(c / 100).toFixed(2)}`);

/*
 * Revisions (lib/revisions). Delivery or Support decides what each request is; Delivery releases revised work (never automatic, the same
 * 12-hour target as every release); Catalog approves the revision terms sellers propose for their listings.
 */
export default async function AdminRevisions() {
  const viewer = await requireViewer({ path: '/dashboard/admin/revisions', roles: ['admin'], scope: ['delivery', 'support', 'catalog'] });
  const submitted = await revisionsFor({ statuses: ['submitted'] });
  const pending = await revisionsFor({ statuses: ['release_pending'] });
  const assigned = await revisionsFor({ statuses: ['assigned'] });
  const policies = await proposedPolicies();
  const orderIds = [...new Set([...submitted, ...pending, ...assigned].map((r) => r.orderId))];
  const orders = new Map(await Promise.all(orderIds.map(async (id) => [id, await getOrder(id)] as const)));
  const sums = new Map(await Promise.all(submitted.map(async (r) => [r.orderId, await revisionSummary(r.orderId)] as const)));
  const products = new Map(await Promise.all(policies.map(async (p) => [p.productId, await requestableProduct(p.productId)] as const)));
  const title = (id: string) => orders.get(id)?.title ?? 'Order';
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-revisions" title="Revisions">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Requests to decide ({submitted.length})</h2>
            <p className="sub">
              A defect is always fixed free and never counted. An included change uses one of the order&apos;s included revisions, inside its window. Anything else is a paid change or a new feature:
              write the requirement set and it becomes a custom request the buyer confirms, gets quoted and pays into escrow first.
            </p>
          </div>
        </div>
        {submitted.length === 0 ? (
          <p className="muted">Nothing waiting.</p>
        ) : (
          <ul className="list" data-revisions-submitted>
            {submitted.map((r) => {
              const s = sums.get(r.orderId);
              return (
                <li key={r.id}>
                  <div className="grow">
                    <b>
                      <Link href={`/dashboard/admin/orders/${r.orderId}`}>{title(r.orderId)}</Link>
                    </b>{' '}
                    · buyer calls it a {r.hint} · {day(r.createdAt)}
                    <p>{r.description}</p>
                    <small className="muted">
                      {s?.terms && s.terms.included > 0
                        ? `${allowanceLeft(s.terms, s.used)} of ${s.terms.included} included left (${s.terms.windowDays} days). Scope: ${s.terms.scope}`
                        : 'No included revisions on this order.'}
                    </small>
                  </div>
                  <AdminForm
                    endpoint={`/api/admin/revisions/${r.id}`}
                    fixed={{ action: 'triage' }}
                    openLabel="Decide"
                    submit="Save the decision"
                    fields={[
                      {
                        name: 'kind',
                        label: 'What is it?',
                        kind: 'select',
                        options: [
                          ['defect', KIND_TEXT.defect],
                          ['included', KIND_TEXT.included],
                          ['paid', KIND_TEXT.paid],
                          ['feature', KIND_TEXT.feature],
                          ['decline', 'Decline (outside the accepted terms)'],
                        ],
                      },
                      { name: 'note', label: 'Note for the buyer', kind: 'textarea', required: true, max: 2000 },
                      {
                        name: 'requirements',
                        label: 'Written requirement set the buyer will confirm (50 characters or more)',
                        kind: 'textarea',
                        max: 8000,
                        showWhen: { field: 'kind', equals: 'paid' },
                      },
                      {
                        name: 'requirements',
                        label: 'Written requirement set the buyer will confirm (50 characters or more)',
                        kind: 'textarea',
                        max: 8000,
                        showWhen: { field: 'kind', equals: 'feature' },
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Revised work to release ({pending.length})</h2>
            <p className="sub">
              Check the revised files (they passed the file checks and review) or the live site, then release it to the buyer or return it to the seller. A missed target only raises alerts.
            </p>
          </div>
        </div>
        {pending.length === 0 ? (
          <p className="muted">Nothing waiting.</p>
        ) : (
          <ul className="list" data-revisions-pending>
            {pending.map((r) => (
              <li key={r.id}>
                <div className="grow">
                  <b>
                    <Link href={`/dashboard/admin/orders/${r.orderId}`}>{title(r.orderId)}</Link>
                  </b>{' '}
                  · {r.kind ? KIND_TEXT[r.kind] : ''} · {r.fileId ? 'with checked files' : 'no files (live site or repository)'}
                  {r.releaseDueAt && <SlaClock dueAt={r.releaseDueAt} slaHours={CONFIG.release.slaHours} />}
                  <p>Asked: {r.description}</p>
                  <p className="muted">Seller: {r.deliveryNote}</p>
                </div>
                <div className="act-row">
                  <AdminForm
                    endpoint={`/api/admin/revisions/${r.id}`}
                    fixed={{ action: 'release' }}
                    openLabel="Release"
                    submit="Release to the buyer"
                    tone="dark"
                    fields={[{ name: 'note', label: 'What you checked', kind: 'textarea', max: 1000 }]}
                  />
                  <AdminForm
                    endpoint={`/api/admin/revisions/${r.id}`}
                    fixed={{ action: 'return' }}
                    openLabel="Return to seller"
                    submit="Return"
                    tone="line"
                    fields={[{ name: 'reason', label: 'What the seller must fix', kind: 'textarea', required: true, max: 1000 }]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {assigned.length > 0 && <p className="muted">With sellers now: {assigned.map((r) => title(r.orderId)).join(', ')}</p>}
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Revision terms to approve ({policies.length})</h2>
            <p className="sub">Terms a seller proposed for a listing. Once approved they are the default in that listing&apos;s quotations; accepted orders keep the terms they were quoted.</p>
          </div>
        </div>
        {policies.length === 0 ? (
          <p className="muted">Nothing waiting.</p>
        ) : (
          <ul className="list" data-policies-proposed>
            {policies.map((p) => (
              <li key={p.id}>
                <div className="grow">
                  <b>{products.get(p.productId)?.name ?? 'Listing'}</b> · version {p.version}
                  <p className="muted">
                    {p.included} included within {p.windowDays} days · extra {usd(p.extraPriceCents)}
                    {p.scope ? ` · ${p.scope}` : ''}
                    {p.supportTerms ? ` · Support: ${p.supportTerms}` : ''}
                  </p>
                </div>
                <div className="act-row">
                  <AdminForm endpoint={`/api/admin/revision-policies/${p.id}`} fixed={{ decision: 'approve' }} openLabel="Approve" submit="Approve the terms" fields={[]} />
                  <AdminForm
                    endpoint={`/api/admin/revision-policies/${p.id}`}
                    fixed={{ decision: 'reject' }}
                    openLabel="Reject"
                    submit="Reject"
                    tone="line"
                    fields={[{ name: 'reason', label: 'Why (the seller sees this)', kind: 'textarea', required: true, max: 500 }]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashShell>
  );
}
