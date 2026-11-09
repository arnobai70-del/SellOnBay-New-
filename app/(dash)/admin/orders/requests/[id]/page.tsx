import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { QuoteEditor } from '@/components/QuoteEditor';
import { ConversationPanel } from '@/components/ConversationPanel';
import { TIER_TEXT } from '@/lib/licenceTiers';
import { requestableProduct } from '@/lib/requests/products';
import { listedLines, listedSellerCents } from '@/lib/requests/rules';
import { getRequest, quoteEvents, quotesOf, requestEvents } from '@/lib/requests/store';
import { QUOTE_WORDS, REQUEST_WORDS, personNames, productNames, requestTitle, usd } from '@/lib/requests/view';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Purchase request', robots: { index: false } };
export const dynamic = 'force-dynamic';

const day = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const why = { name: 'note', label: 'Message (the buyer sees it)', kind: 'textarea' as const, required: true };

/* One request for Support or Catalog: the facts, the full log, the next steps, and the quotation editor. */
export default async function AdminRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer({ path: `/admin/orders/requests/${id}`, roles: ['admin'], scope: ['support', 'catalog'] });
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await getRequest(id) : null;
  if (!r) notFound();
  const [products, buyers, events, quotes] = await Promise.all([productNames([r.productId]), personNames([r.buyerId]), requestEvents(r.id), quotesOf(r.id)]);
  const product = r.productId ? await requestableProduct(r.productId) : null;
  const listed = product && r.licenceTier === 'single_project' ? listedLines(product, r.package, r.extras) : null;
  const open = quotes.find((q) => ['draft', 'pending_super', 'issued'].includes(q.status));
  const canQuote = ['under_review', 'requirements_verified'].includes(r.status) && !open && (r.kind === 'product' || !!r.requirementsConfirmedAt);
  const qEvents = new Map(await Promise.all(quotes.map(async (q) => [q.id, await quoteEvents(q.id)] as const)));
  const [word, chip] = REQUEST_WORDS[r.status] ?? [r.status, 'status st-draft'];
  const title = requestTitle(r, products);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-requests" title={title}>
      <div className="glass card sob-sec" data-admin-request={r.id}>
        <div className="row sob-hd">
          <div>
            <h2>{title}</h2>
            <p className="tag">
              <span className={chip}>
                <i />
                {word}
              </span>{' '}
              · from {buyers.get(r.buyerId) ?? 'a buyer'} · {r.kind === 'custom_dev' ? 'custom development' : 'product request'}
              {product ? (
                <>
                  {' '}
                  · <Link href={`/product/${product.slug}`}>open the listing</Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <dl className="sob-kv">
          <dt>Licence asked for</dt>
          <dd>
            {TIER_TEXT[r.licenceTier].label}
            {r.licenceTier === 'exclusive_review' ? ' (needs special admin and legal/IP review, F-10)' : ''}
          </dd>
          <dt>Package and extras</dt>
          <dd>
            {r.package}
            {r.extras.express ? ', express' : ''}
            {r.extras.hosting ? ', hosting' : ''}
          </dd>
          <dt>Intended use</dt>
          <dd>{r.intendedUse}</dd>
          {r.requirements && (
            <>
              <dt>Requirements</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{r.requirements}</dd>
            </>
          )}
          <dt>Delivery details</dt>
          <dd>
            {Object.entries(r.delivery).length
              ? Object.entries(r.delivery)
                  .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                  .join(' · ')
              : 'None given'}
          </dd>
          <dt>Business</dt>
          <dd>
            {Object.entries(r.business).length
              ? Object.entries(r.business)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ')
              : 'None given'}
          </dd>
          <dt>Consent</dt>
          <dd>
            Version {r.consentVersion}, {day(r.consentedAt)}
          </dd>
          {product && (
            <>
              <dt>Product file</dt>
              <dd>{product.latestVersionId ? 'An approved version is pinned to the quotation when it is written.' : 'No approved file version: it cannot be quoted.'}</dd>
            </>
          )}
        </dl>
        <div className="sob-acts" style={{ marginTop: 12 }}>
          {r.status === 'submitted' && <AdminForm endpoint={`/api/admin/requests/${r.id}`} fixed={{ action: 'review' }} fields={[]} openLabel="Start review" submit="Start review" tone="blue" />}
          {['under_review', 'requirements_verified'].includes(r.status) && (
            <AdminForm endpoint={`/api/admin/requests/${r.id}`} fixed={{ action: 'ask' }} fields={[why]} openLabel="Ask the buyer" submit="Send question" tone="line" />
          )}
          {['submitted', 'under_review', 'needs_info', 'requirements_verified'].includes(r.status) && (
            <AdminForm endpoint={`/api/admin/requests/${r.id}`} fixed={{ action: 'decline' }} fields={[why]} openLabel="Decline" submit="Decline the request" tone="line" />
          )}
          {['submitted', 'under_review', 'needs_info', 'requirements_verified', 'quoted'].includes(r.status) && (
            <AdminForm
              endpoint={`/api/admin/requests/${r.id}`}
              fixed={{ action: 'set_expiry' }}
              fields={[{ name: 'expiresInDays', label: 'Expire this request after how many days (0 = never)', kind: 'text', required: true }]}
              openLabel="Set expiry"
              submit="Save"
              tone="line"
            />
          )}
          {r.kind === 'custom_dev' && r.status === 'under_review' && (
            <AdminForm
              endpoint={`/api/admin/requests/${r.id}`}
              fixed={{ action: 'propose_requirements' }}
              fields={[{ name: 'requirements', label: 'Written requirement set for the buyer to confirm', kind: 'textarea', required: true, value: r.verifiedRequirements ?? '', max: 8000 }]}
              openLabel="Write requirements"
              submit="Send to the buyer"
              tone="line"
            />
          )}
          {r.kind === 'custom_dev' && ['submitted', 'under_review', 'needs_info', 'requirements_verified'].includes(r.status) && (
            <>
              <p className="muted" data-assigned={r.assignedSellerId ?? 'sellonbay'}>
                Developer: {r.assignedSellerId ? `seller account ${r.assignedSellerId}` : 'SellOnBay (no seller split)'}. Choose before quoting: the quotation records that seller&apos;s plan and
                commission.
                {r.parentOrderId ? ' This is a paid change to an earlier order.' : ''}
              </p>
              <AdminForm
                endpoint={`/api/admin/requests/${r.id}`}
                fixed={{ action: 'assign' }}
                fields={[{ name: 'sellerId', label: 'Seller account id (leave empty for SellOnBay)', kind: 'text', value: r.assignedSellerId ?? '', max: 36 }]}
                openLabel="Assign a developer"
                submit="Assign"
                tone="line"
              />
            </>
          )}
        </div>
      </div>

      {canQuote && (
        <div className="glass card sob-sec">
          <div className="row sob-hd">
            <div>
              <h2>Write a quotation</h2>
              <p className="tag">Valid 7 days once issued. Commission is worked out from the seller&apos;s plan. Any difference from the listed price goes to a Super Admin first.</p>
            </div>
          </div>
          <QuoteEditor
            requestId={r.id}
            start={(listed ?? [{ label: r.kind === 'custom_dev' ? 'Custom development' : title, cents: 0, kind: r.kind === 'custom_dev' ? 'custom' : 'product' }]).map((l) => ({
              label: l.label,
              cents: l.cents,
              kind: l.kind,
            }))}
            listedCents={listed ? listedSellerCents(listed) : null}
            defaults={{ deliveryDays: product?.deliveryDays ?? 7, deliveryHours: product?.deliveryHours ?? null, supportDays: product?.supportDays ?? 0, updateDays: product?.updateDays ?? 0 }}
            exclusive={r.licenceTier === 'exclusive_review'}
          />
        </div>
      )}

      {quotes.length > 0 && (
        <div className="glass card sob-sec">
          <div className="row sob-hd">
            <div>
              <h2>Quotations</h2>
            </div>
          </div>
          {quotes.map((q) => (
            <div key={q.id} className="sob-item" data-quote={q.id}>
              <b>
                Version {q.version}: {QUOTE_WORDS[q.status]} · {usd(q.totalCents)} · fee {usd(q.feeCents)} ({q.ownerType === 'platform' ? 'platform-owned' : `${(q.commissionBps ?? 0) / 100}%`})
              </b>
              <small className="muted">
                {q.lines.map((l) => `${l.label} ${usd(l.cents)}`).join(' · ')}
                {q.priceOverride ? ` · differs from listed ${q.listedCents === null ? '(none)' : usd(q.listedCents)}: ${q.overrideReason}` : ''}
                {q.validUntil ? ` · valid until ${day(q.validUntil)}` : ''}
                {q.orderId ? ' · order created' : ''}
              </small>
              <small className="muted">{(qEvents.get(q.id) ?? []).map((e) => `${e.event} ${day(e.at)}`).join(' · ')}</small>
              <div className="sob-acts">
                {q.status === 'draft' && (
                  <AdminForm
                    endpoint={`/api/admin/quotations/${q.id}`}
                    fixed={{ action: 'issue' }}
                    fields={[]}
                    openLabel="Issue"
                    submit={q.priceOverride ? 'Send to Super Admin' : 'Send to the buyer'}
                    tone="blue"
                  />
                )}
                {['draft', 'pending_super', 'issued'].includes(q.status) && (
                  <AdminForm
                    endpoint={`/api/admin/quotations/${q.id}`}
                    fixed={{ action: 'withdraw' }}
                    fields={[{ name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea', required: true }]}
                    openLabel="Withdraw"
                    submit="Withdraw"
                    tone="line"
                  />
                )}
                {q.orderId && (
                  <Link className="btn ghost sm" href={`/admin/orders/${q.orderId}`}>
                    Open the order
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConversationPanel type="request" id={r.id} me="admin" heading="Messages" />

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>Log</h2>
          </div>
        </div>
        <ul className="sob-tl2">
          {events.map((e, i) => (
            <li key={i}>
              <b>
                {e.event.replace(/_/g, ' ')}
                {e.from && e.to && e.from !== e.to ? ` (${e.from} → ${e.to})` : ''}
              </b>
              {e.note && <span style={{ whiteSpace: 'pre-wrap' }}>{e.note}</span>}
              <small>{day(e.at)}</small>
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}
