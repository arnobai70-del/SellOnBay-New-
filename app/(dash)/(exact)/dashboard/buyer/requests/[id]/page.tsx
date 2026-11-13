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

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Your request'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* An issued quotation can be accepted until its end (the server checks again on accept). */
const stillValid = (until: number) => until > Date.now();
const day = (ms: number) => new Date(ms).toUTCString().replace(':00 GMT', ' UTC');

/* One request: what was asked, SellOnBay's questions and answers, and the quotation with its full terms to accept or decline. */
export default async function BuyerRequest({ params }: { params: Promise<{ id: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const { id } = await params;
  const viewer = await requireViewer({ path: `/dashboard/buyer/requests/${id}`, roles: ['buyer'] });
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await getRequest(id) : null;
  if (!viewer || !r || r.buyerId !== viewer.id) notFound(); // someone else's request is a 404, never a hint that it exists
  const products = await productNames([r.productId]);
  const title = requestTitle(r, products);
  const timeline = buyerTimeline(await requestEvents(r.id));
  const q = buyerQuote(await quotesOf(r.id));
  const [word, chip] = REQUEST_WORDS[r.status] ?? [r.status, 'status st-draft'];
  return (
    <DashShell name={viewer.name} signedIn role="buyer" active="buyer-requests" title={title} viewerRole={viewer.role}>
      <div className="glass card sob-sec" data-request={r.id}>
        <div className="row sob-hd">
          <div>
            <h2>{title}</h2>
            <p className="tag">
              <span className={chip}>
                <i />
                {word}
              </span>{' '}
              · {TIER_TEXT[r.licenceTier].label} · {r.package === 'asis' ? tx('As is') : r.package === 'setup' ? tx('With setup help') : tx('With customisation')}
            </p>
          </div>
        </div>
        <dl className="sob-kv">
          <dt>
            <T s={'How you will use it'} />
          </dt>
          <dd>{r.intendedUse}</dd>
          {r.requirements && (
            <>
              <dt>
                <T s={'What you asked for'} />
              </dt>
              <dd>{r.requirements}</dd>
            </>
          )}
        </dl>
        {r.status === 'needs_info' && (
          <ActionButton endpoint={`/api/requests/${r.id}`} body={{ action: 'answer' }} label="Answer SellOnBay" note={{ label: tx('Your answer'), required: true, rows: 4 }} />
        )}
        {r.kind === 'custom_dev' && r.verifiedRequirements && (
          <div className="glass card sob-sec" style={{ marginTop: 16 }} data-requirements>
            <h3>
              <T s={'Requirements written down by SellOnBay'} />
            </h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.verifiedRequirements}</p>
            {r.requirementsConfirmedAt ? (
              <p className="muted">
                <T s={'You confirmed these on {v0}. The quotation is based on them.'} v={{ v0: day(r.requirementsConfirmedAt) }} />
              </p>
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
        <div className="glass card sob-sec" data-quote={q.id}>
          <div className="row sob-hd">
            <div>
              <h2>
                <T s={'Quotation, version {version}'} v={{ version: q.version }} />
              </h2>
              <p className="tag">
                {QUOTE_WORDS[q.status]}
                {q.status === 'issued' && q.validUntil ? ` · valid until ${day(q.validUntil)}` : ''}
              </p>
            </div>
          </div>
          <table className="sob-q-lines">
            <thead>
              <tr>
                <th>
                  <T s={'Item'} />
                </th>
                <th>
                  <T s={'Price'} />
                </th>
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
                <td>
                  <T s={'Total ({currency})'} v={{ currency: q.currency }} />
                </td>
                <td>{usd(q.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
          <dl className="sob-kv" style={{ marginTop: 16 }}>
            <dt>
              <T s={'Licence'} />
            </dt>
            <dd>
              {TIER_TEXT[q.terms.licenceTier].label}. {TIER_TEXT[q.terms.licenceTier].terms}{' '}
              <small className="muted">
                <T s={'(text version {licenceTextVersion})'} v={{ licenceTextVersion: q.terms.licenceTextVersion }} />
              </small>
            </dd>
            <dt>
              <T s={'Delivery'} />
            </dt>
            <dd>
              <T
                s={'{v0} after SellOnBay releases the work'}
                v={{ v0: q.terms.deliveryHours ? `${q.terms.deliveryHours} hours` : `${q.terms.deliveryDays} day${q.terms.deliveryDays === 1 ? '' : 's'}` }}
              />
            </dd>
            <dt>
              <T s={'Revisions'} />
            </dt>
            <dd>
              <T
                s={'{v0}{v1}. Fixing a defect never uses a revision.'}
                v={{
                  v0: q.terms.revisions.included ? `${q.terms.revisions.included} included within ${q.terms.revisions.windowDays} days: ${q.terms.revisions.scope}` : 'None included',
                  v1: q.terms.revisions.extraPriceCents !== null ? ` · extra revisions ${usd(q.terms.revisions.extraPriceCents)} each` : '',
                }}
              />
            </dd>
            <dt>
              <T s={'Support and updates'} />
            </dt>
            <dd>
              {q.terms.supportDays ? `${q.terms.supportDays} days of support` : tx('No support period')} · {q.terms.updateDays ? `${q.terms.updateDays} days of updates` : tx('No updates')}
            </dd>
            {q.terms.note && (
              <>
                <dt>
                  <T s={'Note'} />
                </dt>
                <dd>{q.terms.note}</dd>
              </>
            )}
          </dl>
          {q.status === 'issued' && q.validUntil && stillValid(q.validUntil) && (
            <div className="sob-acts" style={{ marginTop: 16 }}>
              <ActionButton
                endpoint={`/api/quotations/${q.id}`}
                body={{ action: 'accept' }}
                label="Accept and continue to payment"
                confirm={`You accept this exact quotation (${usd(q.totalCents)}) and its terms. An order is created and SellOnBay sends payment instructions. Files are released only after your payment is verified and approved.`}
                goTo={(j) => (typeof j.order === 'string' ? `/orders/${j.order}` : null)}
              />
              <ActionButton endpoint={`/api/quotations/${q.id}`} body={{ action: 'reject' }} label="Decline or ask for changes" tone="line" note={{ label: tx('What should change? (optional)') }} />
            </div>
          )}
          {q.status === 'accepted' && q.orderId && (
            <p style={{ marginTop: 16 }}>
              <Link className="btn sm" href={`/orders/${q.orderId}`}>
                <T s={'Open your order'} />
              </Link>
            </p>
          )}
        </div>
      )}

      <ConversationPanel type="request" id={r.id} me="buyer" />

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'What happened'} />
            </h2>
          </div>
        </div>
        <ul className="sob-tl2">
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
