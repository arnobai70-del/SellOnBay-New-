import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/ActionButton';
import { ConversationPanel } from '@/components/ConversationPanel';
import { DashShell } from '@/components/DashShell';
import { TIER_TEXT } from '@/lib/licenceTiers';
import { getRequest, quotesOf, requestEvents } from '@/lib/requests/store';
import { QUOTE_WORDS, REQUEST_WORDS, buyerQuote, buyerTimeline, productNames, requestTitle, usd } from '@/lib/requests/view';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Your request', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* An issued quotation can be accepted until its end (the server checks again on accept). */
const stillValid = (until: number) => until > Date.now();
const day = (ms: number) => new Date(ms).toUTCString().replace(':00 GMT', ' UTC');

/* One request: what was asked, SellOnBay's questions and answers, and the quotation with its full terms to accept or decline. */
export default async function BuyerRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer({ path: `/dashboard/buyer/requests/${id}`, roles: ['buyer'] });
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await getRequest(id) : null;
  if (!viewer || !r || r.buyerId !== viewer.id) notFound(); // someone else's request is a 404, never a hint that it exists
  const products = await productNames([r.productId]);
  const title = requestTitle(r, products);
  const timeline = buyerTimeline(await requestEvents(r.id));
  const q = buyerQuote(await quotesOf(r.id));
  const [word, chip] = REQUEST_WORDS[r.status] ?? [r.status, 'chip'];
  return (
    <DashShell name={viewer.name} signedIn role="buyer" active="buyer-requests" title={title} viewerRole={viewer.role}>
      <div className="dp" data-request={r.id}>
        <div className="hd">
          <div>
            <h2>{title}</h2>
            <p className="sub">
              <span className={chip}>
                <i />
                {word}
              </span>{' '}
              · {TIER_TEXT[r.licenceTier].label} · {r.package === 'asis' ? 'As is' : r.package === 'setup' ? 'With setup help' : 'With customisation'}
            </p>
          </div>
        </div>
        <dl className="kv">
          <dt>How you will use it</dt>
          <dd>{r.intendedUse}</dd>
          {r.requirements && (
            <>
              <dt>What you asked for</dt>
              <dd>{r.requirements}</dd>
            </>
          )}
        </dl>
        {r.status === 'needs_info' && <ActionButton endpoint={`/api/requests/${r.id}`} body={{ action: 'answer' }} label="Answer SellOnBay" note={{ label: 'Your answer', required: true, rows: 4 }} />}
        {r.kind === 'custom_dev' && r.verifiedRequirements && (
          <div className="dp" style={{ marginTop: 16 }} data-requirements>
            <h3>Requirements written down by SellOnBay</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.verifiedRequirements}</p>
            {r.requirementsConfirmedAt ? (
              <p className="muted">You confirmed these on {day(r.requirementsConfirmedAt)}. The quotation is based on them.</p>
            ) : (
              r.status === 'under_review' && (
                <ActionButton
                  endpoint={`/api/requests/${r.id}`}
                  body={{ action: 'confirm_requirements' }}
                  label="These are my requirements"
                  confirm="Anything not written here is not part of the job. If something is missing, answer below instead of confirming."
                />
              )
            )}
          </div>
        )}
      </div>

      {q && (
        <div className="dp" data-quote={q.id}>
          <div className="hd">
            <div>
              <h2>Quotation, version {q.version}</h2>
              <p className="sub">
                {QUOTE_WORDS[q.status]}
                {q.status === 'issued' && q.validUntil ? ` · valid until ${day(q.validUntil)}` : ''}
              </p>
            </div>
          </div>
          <table className="q-lines">
            <thead>
              <tr>
                <th>Item</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.label}</td>
                  <td>{usd(l.cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total ({q.currency})</td>
                <td>{usd(q.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
          <dl className="kv" style={{ marginTop: 16 }}>
            <dt>Licence</dt>
            <dd>
              {TIER_TEXT[q.terms.licenceTier].label}. {TIER_TEXT[q.terms.licenceTier].terms} <small className="muted">(text version {q.terms.licenceTextVersion})</small>
            </dd>
            <dt>Delivery</dt>
            <dd>{q.terms.deliveryHours ? `${q.terms.deliveryHours} hours` : `${q.terms.deliveryDays} day${q.terms.deliveryDays === 1 ? '' : 's'}`} after SellOnBay releases the work</dd>
            <dt>Revisions</dt>
            <dd>
              {q.terms.revisions.included ? `${q.terms.revisions.included} included within ${q.terms.revisions.windowDays} days: ${q.terms.revisions.scope}` : 'None included'}
              {q.terms.revisions.extraPriceCents !== null ? ` · extra revisions ${usd(q.terms.revisions.extraPriceCents)} each` : ''}. Fixing a defect never uses a revision.
            </dd>
            <dt>Support and updates</dt>
            <dd>
              {q.terms.supportDays ? `${q.terms.supportDays} days of support` : 'No support period'} · {q.terms.updateDays ? `${q.terms.updateDays} days of updates` : 'No updates'}
            </dd>
            {q.terms.note && (
              <>
                <dt>Note</dt>
                <dd>{q.terms.note}</dd>
              </>
            )}
          </dl>
          {q.status === 'issued' && q.validUntil && stillValid(q.validUntil) && (
            <div className="act-row" style={{ marginTop: 16 }}>
              <ActionButton
                endpoint={`/api/quotations/${q.id}`}
                body={{ action: 'accept' }}
                label="Accept and continue to payment"
                confirm={`You accept this exact quotation (${usd(q.totalCents)}) and its terms. An order is created and SellOnBay sends payment instructions. Files are released only after your payment is verified and approved.`}
                goTo={(j) => (typeof j.order === 'string' ? `/orders/${j.order}` : null)}
              />
              <ActionButton endpoint={`/api/quotations/${q.id}`} body={{ action: 'reject' }} label="Decline or ask for changes" tone="line" note={{ label: 'What should change? (optional)' }} />
            </div>
          )}
          {q.status === 'accepted' && q.orderId && (
            <p style={{ marginTop: 16 }}>
              <Link className="btn btn-blue btn-sm" href={`/orders/${q.orderId}`}>
                Open your order
              </Link>
            </p>
          )}
        </div>
      )}

      <ConversationPanel type="request" id={r.id} me="buyer" />

      <div className="dp">
        <div className="hd">
          <div>
            <h2>What happened</h2>
          </div>
        </div>
        <ul className="tl2">
          {timeline.map((t, i) => (
            <li key={i}>
              <b>{t.text}</b>
              {t.note && <span style={{ whiteSpace: 'pre-wrap' }}>{t.note}</span>}
              <small>{day(t.at)}</small>
            </li>
          ))}
        </ul>
        {['submitted', 'under_review', 'needs_info', 'requirements_verified', 'quoted'].includes(r.status) && (
          <div style={{ marginTop: 16 }}>
            <ActionButton
              endpoint={`/api/requests/${r.id}`}
              body={{ action: 'withdraw' }}
              label="Withdraw this request"
              tone="line"
              confirm="The request is closed. You can send a new one at any time."
            />
          </div>
        )}
      </div>
    </DashShell>
  );
}
