import { AdminForm } from './AdminForm';
import { RevisionDownload } from './RevisionDownload';
import { getOrder } from '@/lib/orders/service';
import { RELEASED_STATES } from '@/lib/release/rules';
import { allowanceLeft, KIND_TEXT, OPEN_REVISION, windowEndsAt } from '@/lib/revisions/rules';
import { revisionSummary } from '@/lib/revisions/service';

const STATUS_TEXT: Record<string, string> = {
  submitted: 'Waiting for SellOnBay to look at it',
  declined: 'Not possible under your terms',
  quoted: 'Handled as a paid change: see your requests',
  assigned: 'Being worked on',
  release_pending: 'Being checked by SellOnBay',
  delivered: 'Ready: please check it',
  closed: 'Closed',
};
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/*
 * The buyer's changes on a delivered order (lib/revisions): what the accepted terms include, the requests so far, and a form for a new one.
 * SellOnBay decides whether a request is a defect (always free, never counted), an included change, or paid work quoted separately.
 */
export async function RevisionPanel({ orderId }: { orderId: string }) {
  const o = await getOrder(orderId);
  if (!o || !(RELEASED_STATES as readonly string[]).includes(o.state)) return null;
  const { terms, used, revisions } = await revisionSummary(orderId);
  const open = revisions.some((r) => OPEN_REVISION.includes(r.status));
  const releasedAt = o.releaseApprovedAt ?? o.deliveredAt ?? o.createdAt;
  return (
    <section className="sob-dp" aria-labelledby={`rev-${orderId}`} data-revisions={orderId}>
      <div className="hd">
        <div>
          <h2 id={`rev-${orderId}`}>Changes and fixes</h2>
          <p className="sub">
            {terms && terms.included > 0
              ? `${allowanceLeft(terms, used)} of ${terms.included} included revisions left, until ${day(windowEndsAt(releasedAt, terms))}. Included: ${terms.scope}`
              : 'Your order has no included revisions. Changes are quoted separately.'}{' '}
            Faults in what was delivered are always fixed free and never counted.
          </p>
        </div>
      </div>
      {revisions.length > 0 && (
        <ul className="sob-list">
          {[...revisions].reverse().map((r) => (
            <li key={r.id} data-rev={r.status}>
              <div className="sob-grow">
                <b>{STATUS_TEXT[r.status]}</b> · asked {day(r.createdAt)}
                {r.kind ? ` · ${KIND_TEXT[r.kind]}` : ''}
                <p className="muted">{r.description}</p>
                {r.decisionNote && <p>SellOnBay: {r.decisionNote}</p>}
                {r.status === 'delivered' && r.deliveryNote && <p>What changed: {r.deliveryNote}</p>}
              </div>
              {r.status === 'delivered' && (
                <div className="sob-act-row">
                  {r.fileId && <RevisionDownload orderId={orderId} revisionId={r.id} />}
                  <AdminForm
                    endpoint={`/api/orders/${orderId}/revisions/${r.id}`}
                    fixed={{ action: 'answer', answer: 'done' }}
                    fields={[]}
                    openLabel="It is done"
                    submit="Confirm it is done"
                    tone="blue"
                  />
                  <AdminForm
                    endpoint={`/api/orders/${orderId}/revisions/${r.id}`}
                    fixed={{ action: 'answer', answer: 'not_done' }}
                    fields={[{ name: 'note', label: 'What is still not done', kind: 'textarea', required: true, max: 2000 }]}
                    openLabel="It is not done"
                    submit="Send it back"
                    tone="line"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <p className="muted">One change request at a time: this one needs to finish first.</p>
      ) : (
        <AdminForm
          endpoint={`/api/orders/${orderId}/revisions`}
          openLabel="Ask for a change or report a fault"
          submit="Send to SellOnBay"
          fields={[
            {
              name: 'hint',
              label: 'What is it?',
              kind: 'select',
              options: [
                ['change', 'A change I would like'],
                ['defect', 'Something that does not work as delivered'],
              ],
              required: true,
            },
            { name: 'description', label: 'Describe it', kind: 'textarea', required: true, max: 4000, hint: 'No emails, phone numbers or links: SellOnBay passes it on.' },
            { name: 'consent', label: 'I agree that paid changes are quoted first and paid into escrow before work starts.', kind: 'checkbox', required: true },
          ]}
        />
      )}
    </section>
  );
}
