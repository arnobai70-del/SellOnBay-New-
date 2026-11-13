import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { DeliveryForm } from '@/components/DeliveryForm';
import { SlaClock } from '@/components/SlaClock';
import { CONFIG } from '@/lib/config';
import { sellerDashboard } from '@/lib/dashboard';
import { listFiles } from '@/lib/files/store';
import { getOrder } from '@/lib/orders/service';
import { KIND_TEXT } from '@/lib/revisions/rules';
import { approvedPolicy } from '@/lib/revisions/service';
import { policiesOf, revisionsFor } from '@/lib/revisions/store';
import { requestableProduct } from '@/lib/requests/products';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Revisions'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const usd = (c: number | null) => (c === null ? 'not offered' : `$${(c / 100).toFixed(2)}`);

/*
 * The seller's revisions (lib/revisions): changes SellOnBay assigned to them on their orders, and the revision terms of each listing
 * (proposed here, approved by SellOnBay's Catalog team before quotations use them). The seller never talks to the buyer directly.
 */
export default async function SellerRevisions() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/revisions', roles: ['seller'] });
  const me = viewer?.id ?? null;
  const todo = me ? await revisionsFor({ sellerId: me, statuses: ['assigned', 'release_pending'] }) : [];
  const recent = me ? (await revisionsFor({ sellerId: me, statuses: ['delivered', 'closed'] })).slice(-10).reverse() : [];
  const files = me ? (await listFiles({ uploadedBy: me })).filter((f) => f.purpose === 'revision') : [];
  const orders = new Map(await Promise.all([...new Set([...todo, ...recent].map((r) => r.orderId))].map(async (id) => [id, await getOrder(id)] as const)));
  const listings = me ? ((await sellerDashboard(me))?.listings ?? []) : [];
  const terms = await Promise.all(
    listings.map(async (l) => {
      const p = await requestableProduct(l.slug);
      const all = p ? await policiesOf(p.id) : [];
      return { l, approved: p ? await approvedPolicy(p.id) : null, proposed: all.find((x) => x.status === 'proposed') ?? null, rejected: all.find((x) => x.status === 'rejected') ?? null };
    }),
  );
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="seller" active="seller-revisions" title={tx('Revisions')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Revisions to do'} />
            </h2>
            <p className="tag">
              <T s={'SellOnBay checks each request with the buyer and tells you what to change. Your revised work goes to SellOnBay first, then to the buyer.'} />
            </p>
          </div>
        </div>
        {todo.length === 0 ? (
          <p className="muted">
            <T s={'Nothing to do right now.'} />
          </p>
        ) : (
          <ul className="sob-list" data-seller-revisions>
            {todo.map((r) => {
              const o = orders.get(r.orderId);
              const mine = files.filter((f) => f.orderId === r.orderId);
              return (
                <li key={r.id}>
                  <div className="sob-grow">
                    <b>{o?.title ?? tx('Order')}</b> <T s={'· {v0} · asked {v1}'} v={{ v0: r.kind ? KIND_TEXT[r.kind] : '', v1: day(r.createdAt) }} />
                    <p>{r.description}</p>
                    {r.decisionNote && (
                      <p className="muted">
                        <T s={'SellOnBay: {decisionNote}'} v={{ decisionNote: r.decisionNote }} />
                      </p>
                    )}
                    {r.status === 'release_pending' ? (
                      <>
                        <small className="muted">
                          <T s={'Sent. Waiting for SellOnBay to release it to the buyer.'} />
                        </small>{' '}
                        {r.releaseDueAt && <SlaClock dueAt={r.releaseDueAt} slaHours={CONFIG.release.slaHours} />}
                      </>
                    ) : (
                      <DeliveryForm
                        orderId={r.orderId}
                        revisionId={r.id}
                        approvedFiles={mine.filter((f) => f.state === 'approved').map((f) => ({ id: f.id, name: f.originalName }))}
                        pending={mine.filter((f) => ['awaiting_upload', 'checking', 'awaiting_review'].includes(f.state)).length}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {recent.length > 0 && (
          <p className="muted">
            <T s={'Recently delivered:'} /> {recent.map((r) => `${orders.get(r.orderId)?.title ?? 'order'} (${r.status === 'closed' ? 'closed' : 'with the buyer'})`).join(', ')}
          </p>
        )}
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Revision terms of your listings'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'What each listing includes after delivery: how many changes, for how long, what counts as a change, and the price of an extra one. Faults in what you delivered are always fixed free and never counted. SellOnBay approves the terms before they go into quotations.'
                }
              />
            </p>
          </div>
        </div>
        {terms.length === 0 ? (
          <p className="muted">
            <T s={'You have no listings yet.'} />
          </p>
        ) : (
          <ul className="sob-list">
            {terms.map(({ l, approved, proposed, rejected }) => (
              <li key={l.slug} data-policy={l.slug}>
                <div className="sob-grow">
                  <b>{l.name}</b>
                  <p className="muted">
                    {approved
                      ? `Approved: ${approved.included} included within ${approved.windowDays} days · extra ${usd(approved.extraPriceCents)}${approved.scope ? ` · ${approved.scope}` : ''}`
                      : tx('No approved terms: quotations include no revisions unless SellOnBay writes them in.')}
                    {proposed ? tx(' · New terms waiting for approval.') : ''}
                    {!proposed && rejected && rejected.decisionReason ? ` · Last proposal rejected: ${rejected.decisionReason}` : ''}
                  </p>
                </div>
                <AdminForm
                  endpoint="/api/seller/revision-policy"
                  fixed={{ product: l.slug }}
                  openLabel={proposed ? 'Change the proposal' : 'Propose terms'}
                  submit="Send for approval"
                  tone="line"
                  fields={[
                    { name: 'included', label: tx('Included revisions (0 to 50)'), kind: 'text', required: true, value: String(proposed?.included ?? approved?.included ?? 1), max: 2 },
                    { name: 'windowDays', label: tx('For how many days after delivery'), kind: 'text', required: true, value: String(proposed?.windowDays ?? approved?.windowDays ?? 14), max: 3 },
                    { name: 'scope', label: tx('What counts as a revision'), kind: 'textarea', value: proposed?.scope ?? approved?.scope ?? '', max: 1000 },
                    { name: 'extraPrice', label: tx('Price of an extra revision in dollars (empty: quoted each time)'), kind: 'text', value: '', max: 12 },
                    { name: 'supportTerms', label: tx('Support you give after delivery'), kind: 'textarea', value: proposed?.supportTerms ?? approved?.supportTerms ?? '', max: 1000 },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashShell>
  );
}
