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

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Revisions', robots: { index: false } };
export const dynamic = 'force-dynamic';

const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const usd = (c: number | null) => (c === null ? 'quoted each time' : `$${(c / 100).toFixed(2)}`);

/*
 * Revisions (lib/revisions). Delivery or Support decides what each request is; Delivery releases revised work (never automatic, the same
 * 12-hour target as every release); Catalog approves the revision terms sellers propose for their listings.
 */
export default async function AdminRevisions() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/orders/revisions', roles: ['admin'], scope: ['delivery', 'support', 'catalog'] });
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
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-revisions" title={tx('Revisions')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Requests to decide ({length})'} v={{ length: submitted.length }} />
            </h2>
            <p className="tag">
              <T
                s={
                  "A defect is always fixed free and never counted. An included change uses one of the order's included revisions, inside its window. Anything else is a paid change or a new feature: write the requirement set and it becomes a custom request the buyer confirms, gets quoted and pays into escrow first."
                }
              />
            </p>
          </div>
        </div>
        {submitted.length === 0 ? (
          <p className="muted">
            <T s={'Nothing waiting.'} />
          </p>
        ) : (
          <ul className="sob-list" data-revisions-submitted>
            {submitted.map((r) => {
              const s = sums.get(r.orderId);
              return (
                <li key={r.id}>
                  <div className="sob-grow">
                    <b>
                      <Link href={`/admin/orders/${r.orderId}`}>{title(r.orderId)}</Link>
                    </b>{' '}
                    <T s={'· buyer calls it a {hint} · {v1}'} v={{ hint: r.hint, v1: day(r.createdAt) }} />
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

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Revised work to release ({length})'} v={{ length: pending.length }} />
            </h2>
            <p className="tag">
              <T
                s={'Check the revised files (they passed the file checks and review) or the live site, then release it to the buyer or return it to the seller. A missed target only raises alerts.'}
              />
            </p>
          </div>
        </div>
        {pending.length === 0 ? (
          <p className="muted">
            <T s={'Nothing waiting.'} />
          </p>
        ) : (
          <ul className="sob-list" data-revisions-pending>
            {pending.map((r) => (
              <li key={r.id}>
                <div className="sob-grow">
                  <b>
                    <Link href={`/admin/orders/${r.orderId}`}>{title(r.orderId)}</Link>
                  </b>{' '}
                  · {r.kind ? KIND_TEXT[r.kind] : ''} · {r.fileId ? 'with checked files' : 'no files (live site or repository)'}
                  {r.releaseDueAt && <SlaClock dueAt={r.releaseDueAt} slaHours={CONFIG.release.slaHours} />}
                  <p>
                    <T s={'Asked: {description}'} v={{ description: r.description }} />
                  </p>
                  <p className="muted">
                    <T s={'Seller: {deliveryNote}'} v={{ deliveryNote: r.deliveryNote }} />
                  </p>
                </div>
                <div className="sob-acts">
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
        {assigned.length > 0 && (
          <p className="muted">
            <T s={'With sellers now:'} /> {assigned.map((r) => title(r.orderId)).join(', ')}
          </p>
        )}
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Revision terms to approve ({length})'} v={{ length: policies.length }} />
            </h2>
            <p className="tag">
              <T s={"Terms a seller proposed for a listing. Once approved they are the default in that listing's quotations; accepted orders keep the terms they were quoted."} />
            </p>
          </div>
        </div>
        {policies.length === 0 ? (
          <p className="muted">
            <T s={'Nothing waiting.'} />
          </p>
        ) : (
          <ul className="sob-list" data-policies-proposed>
            {policies.map((p) => (
              <li key={p.id}>
                <div className="sob-grow">
                  <b>{products.get(p.productId)?.name ?? 'Listing'}</b> <T s={'· version {version}'} v={{ version: p.version }} />
                  <p className="muted">
                    <T
                      s={'{included} included within {windowDays} days · extra {v2}{v3}{v4}'}
                      v={{ included: p.included, windowDays: p.windowDays, v2: usd(p.extraPriceCents), v3: p.scope ? ` · ${p.scope}` : '', v4: p.supportTerms ? ` · Support: ${p.supportTerms}` : '' }}
                    />
                  </p>
                </div>
                <div className="sob-acts">
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
