import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConversationPanel } from '@/components/ConversationPanel';
import { DashShell } from '@/components/DashShell';
import { SlaClock } from '@/components/SlaClock';
import { StateChip } from '@/components/StateChip';
import { CONFIG } from '@/lib/config';
import { getOrder, orderEvents } from '@/lib/orders/service';
import { orderCode } from '@/lib/payments/rules';
import { attemptsFor, listRefunds } from '@/lib/payments/store';
import { entitlementFor } from '@/lib/release/store';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
export const metadata: Metadata = { title: 'Order', robots: { index: false } };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '–');

/* One order for the admins who work on it: money, release, access, the full log and the three message channels. */
export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer({ path: `/admin/orders/${id}`, roles: ['admin'], scope: ['support', 'finance', 'delivery', 'catalog'] });
  const o = /^[0-9a-f-]{36}$/i.test(id) ? await getOrder(id) : null;
  if (!o) notFound();
  const [events, attempts, refunds, ent] = await Promise.all([orderEvents(o.id), attemptsFor(o.id), listRefunds({ orderId: o.id }), entitlementFor(o.id)]);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-releases" title={o.title}>
      <div className="glass card sob-sec" data-admin-order={o.id}>
        <div className="row sob-hd">
          <div>
            <h2>
              {o.title} <StateChip state={o.state} />
            </h2>
            <p className="tag">
              <T s={'{v0} · {v1} · fee {v2} · {v3}'} v={{ v0: orderCode(o.id), v1: usd(o.priceCents), v2: usd(o.feeCents), v3: o.quotationId ? 'from a quotation' : 'old checkout' }} />
            </p>
          </div>
        </div>
        <dl className="sob-kv">
          <dt>
            <T s={'Lines'} />
          </dt>
          <dd>{o.lines.map(([l, c]) => `${l} ${usd(c)}`).join(' · ')}</dd>
          <dt>
            <T s={'Paid'} />
          </dt>
          <dd>{o.fundedAt ? `${day(o.fundedAt)} (${o.payment?.ref?.startsWith('manual:') ? 'manual, reconciled' : (o.payment?.brand ?? 'gateway')})` : 'Not yet'}</dd>
          <dt>
            <T s={'Work authorised'} />
          </dt>
          <dd>{day(o.workAuthorisedAt)}</dd>
          <dt>
            <T s={'Files ready'} />
          </dt>
          <dd>{day(o.filesReadyAt)}</dd>
          <dt>
            <T s={'Release'} />
          </dt>
          <dd>{o.releaseApprovedAt ? `Approved ${day(o.releaseApprovedAt)}` : o.releaseDueAt ? <SlaClock dueAt={o.releaseDueAt} slaHours={CONFIG.release.slaHours} /> : 'Not waiting'}</dd>
          <dt>
            <T s={'Buyer access'} />
          </dt>
          <dd>{ent ? `${ent.status} · ${ent.licenceTier} (text ${ent.licenceTextVersion})${ent.statusReason ? ` · ${ent.statusReason}` : ''}` : 'None yet'}</dd>
        </dl>
        <p style={{ marginTop: 12 }}>
          <Link className="btn ghost sm" href="/admin/orders/releases">
            <T s={'Releases'} />
          </Link>{' '}
          <Link className="btn ghost sm" href="/admin/orders/payments">
            <T s={'Payments'} />
          </Link>
        </p>
      </div>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Payments and refunds'} />
            </h2>
          </div>
        </div>
        <ul className="sob-list">
          {attempts.map((a) => (
            <li key={a.id}>
              <div className="sob-grow">
                <b>
                  <T s={'{v0} reported, ref {reference} · {status}'} v={{ v0: usd(a.amountClaimedCents), reference: a.reference, status: a.status }} />
                </b>
                <small>
                  {a.amountReceivedCents !== null ? `received ${usd(a.amountReceivedCents)}, statement ${a.statementRef}` : ''}
                  {a.reviewNote ? ` · ${a.reviewNote}` : ''}
                </small>
              </div>
            </li>
          ))}
          {refunds.map((r) => (
            <li key={r.id}>
              <div className="sob-grow">
                <b>
                  <T s={'Refund {v0} ({kind}) · {status}'} v={{ v0: usd(r.amountCents), kind: r.kind, status: r.status }} />
                </b>
                <small>{r.reason}</small>
              </div>
            </li>
          ))}
          {!attempts.length && !refunds.length && (
            <li className="muted">
              <T s={'None.'} />
            </li>
          )}
        </ul>
      </div>
      <ConversationPanel type="order" id={o.id} me="admin" heading="Messages" />
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Log'} />
            </h2>
          </div>
        </div>
        <ul className="sob-tl2">
          {events.map((e, i) => (
            <li key={i}>
              <b>
                {e.event.replace(/_/g, ' ')}
                {e.from && e.to && e.from !== e.to ? ` (${e.from} → ${e.to})` : ''}
              </b>
              <small>{day(e.at)}</small>
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}
