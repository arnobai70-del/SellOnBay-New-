import { AdminForm } from './AdminForm';
import { RevisionDownload } from './RevisionDownload';
import { getOrder } from '@/lib/orders/service';
import { RELEASED_STATES } from '@/lib/release/rules';
import { allowanceLeft, KIND_TEXT, OPEN_REVISION, windowEndsAt } from '@/lib/revisions/rules';
import { revisionSummary } from '@/lib/revisions/service';

import { getI18n } from '@/lib/i18n/server';
import { T } from '@/components/i18n/T';
import type { Tx } from '@/lib/i18n/tx';
const STATUS_TEXT = (tx: Tx): Record<string, string> => ({
  submitted: tx('Waiting for SellOnBay to look at it'),
  declined: tx('Not possible under your terms'),
  quoted: tx('Handled as a paid change: see your requests'),
  assigned: tx('Being worked on'),
  release_pending: tx('Being checked by SellOnBay'),
  delivered: tx('Ready: please check it'),
  closed: 'Closed',
});
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/*
 * The buyer's changes on a delivered order (lib/revisions): what the accepted terms include, the requests so far, and a form for a new one.
 * SellOnBay decides whether a request is a defect (always free, never counted), an included change, or paid work quoted separately.
 */
export async function RevisionPanel({ orderId }: { orderId: string }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const o = await getOrder(orderId);
  if (!o || !(RELEASED_STATES as readonly string[]).includes(o.state)) return null;
  const { terms, used, revisions } = await revisionSummary(orderId);
  const open = revisions.some((r) => OPEN_REVISION.includes(r.status));
  const releasedAt = o.releaseApprovedAt ?? o.deliveredAt ?? o.createdAt;
  return (
    <section className="sob-dp" aria-labelledby={`rev-${orderId}`} data-revisions={orderId}>
      <div className="hd">
        <div>
          <h2 id={`rev-${orderId}`}>
            <T s={'Changes and fixes'} />
          </h2>
          <p className="sub">
            <T
              s={'{v0} Faults in what was delivered are always fixed free and never counted.'}
              v={{
                v0:
                  terms && terms.included > 0
                    ? `${allowanceLeft(terms, used)} of ${terms.included} included revisions left, until ${day(windowEndsAt(releasedAt, terms))}. Included: ${terms.scope}`
                    : tx('Your order has no included revisions. Changes are quoted separately.'),
              }}
            />
          </p>
        </div>
      </div>
      {revisions.length > 0 && (
        <ul className="sob-list">
          {[...revisions].reverse().map((r) => (
            <li key={r.id} data-rev={r.status}>
              <div className="sob-grow">
                <b>{STATUS_TEXT(tx)[r.status]}</b> <T s={'· asked {v0}{v1}'} v={{ v0: day(r.createdAt), v1: r.kind ? ` · ${KIND_TEXT[r.kind]}` : '' }} />
                <p className="muted">{r.description}</p>
                {r.decisionNote && (
                  <p>
                    <T s={'SellOnBay: {decisionNote}'} v={{ decisionNote: r.decisionNote }} />
                  </p>
                )}
                {r.status === 'delivered' && r.deliveryNote && (
                  <p>
                    <T s={'What changed: {deliveryNote}'} v={{ deliveryNote: r.deliveryNote }} />
                  </p>
                )}
              </div>
              {r.status === 'delivered' && (
                <div className="sob-act-row">
                  {r.fileId && <RevisionDownload orderId={orderId} revisionId={r.id} />}
                  <AdminForm
                    endpoint={`/api/orders/${orderId}/revisions/${r.id}`}
                    fixed={{ action: 'answer', answer: 'done' }}
                    fields={[]}
                    openLabel={tx('It is done')}
                    submit={tx('Confirm it is done')}
                    tone="blue"
                  />
                  <AdminForm
                    endpoint={`/api/orders/${orderId}/revisions/${r.id}`}
                    fixed={{ action: 'answer', answer: 'not_done' }}
                    fields={[{ name: 'note', label: tx('What is still not done'), kind: 'textarea', required: true, max: 2000 }]}
                    openLabel={tx('It is not done')}
                    submit={tx('Send it back')}
                    tone="line"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <p className="muted">
          <T s={'One change request at a time: this one needs to finish first.'} />
        </p>
      ) : (
        <AdminForm
          endpoint={`/api/orders/${orderId}/revisions`}
          openLabel={tx('Ask for a change or report a fault')}
          submit={tx('Send to SellOnBay')}
          fields={[
            {
              name: 'hint',
              label: tx('What is it?'),
              kind: 'select',
              options: [
                ['change', tx('A change I would like')],
                ['defect', tx('Something that does not work as delivered')],
              ],
              required: true,
            },
            { name: 'description', label: tx('Describe it'), kind: 'textarea', required: true, max: 4000, hint: tx('No emails, phone numbers or links: SellOnBay passes it on.') },
            { name: 'consent', label: tx('I agree that paid changes are quoted first and paid into escrow before work starts.'), kind: 'checkbox', required: true },
          ]}
        />
      )}
    </section>
  );
}
